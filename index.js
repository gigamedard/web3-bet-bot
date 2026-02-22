require('dotenv').config();

// Global catch to prevent WebSocket closures from crashing the bot
process.on('uncaughtException', (err) => {
    console.error(`[Process] Uncaught Exception:`, err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Process] Unhandled Rejection:`, reason);
});

const { logger, calculateArbitrageOpportunity } = require('./src/engine/ArbitrageEngine');
const { hydrateDictionaryByCompositeKey } = require('./src/utils/dictionaryHydration');
const AzuroFetcher = require('./src/fetchers/AzuroFetcher');
const OvertimeFetcher = require('./src/fetchers/OvertimeFetcher');
const GasOracle = require('./src/config/GasOracle');

// Configuration
const AZURO_SUBGRAPH_URL = process.env.AZURO_SUBGRAPH_URL;
const OVERTIME_API_URL = process.env.OVERTIME_API_URL;
const AZURO_LP_CONTRACT = process.env.AZURO_LP_CONTRACT || "0x204e7371Ade792c5C006fb52711c50a7efC843ed";
const OVERTIME_SPORTS_AMM_ARBITRUM = process.env.OVERTIME_SPORTS_AMM_ARBITRUM || "0x170a5714112daEfF20E798B6e92e25B86Ea603C1";
const TOTAL_INVESTMENT = parseFloat(process.env.TOTAL_INVESTMENT || "100");

// Protocol Commissions
const AZURO_COMMISSION = 0.05;
const OVERTIME_COMMISSION = 0.03;

const fs = require('fs');

// ── ANSI Color Helpers ──────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    white: '\x1b[97m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
};

// Interval definitions
const DISCOVERY_INTERVAL_MS = 30000; // 30 seconds
const CLAIM_INTERVAL_MS = 60000; // 1 minute

// Global State
let isDiscoveryRunning = false;
let previousAzuroIds = new Set();
let previousOvertimeIds = new Set();
const placedBets = new Set(); // Tracks match IDs already bet on to avoid duplicates

// Initialize Fetchers and Oracle Once
const azuroFetcher = new AzuroFetcher(AZURO_SUBGRAPH_URL, process.env.POLYGON_WS_URL);
const overtimeFetcher = new OvertimeFetcher(OVERTIME_API_URL, process.env.ARBITRUM_RPC_URL, OVERTIME_SPORTS_AMM_ARBITRUM);
const gasOracle = new GasOracle(
    process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    process.env.POLYGON_RPC_URL || "https://polygon-rpc.com"
);

async function runDiscoveryCycle() {
    if (isDiscoveryRunning) {
        logger.warn("[Main Loop] Previous Discovery Cycle still running. Skipping this tick...");
        return;
    }
    isDiscoveryRunning = true;

    logger.debug(`${C.dim}═══════════════════════════════════════════${C.reset}`);
    logger.debug(`${C.dim}🔄 Discovery Cycle Tick${C.reset}`);
    logger.debug(`${C.dim}═══════════════════════════════════════════${C.reset}`);

    try {
        // --- PHASE 1: DISCOVERY (Subgraphs & API) ---
        logger.debug(`${C.cyan}📡 [PHASE 1]${C.reset} Subgraph Discovery: Scanning for events...`);
        const [azuroData, overtimeData] = await Promise.all([
            azuroFetcher.fetchActiveEvents(),
            overtimeFetcher.fetchActiveEvents() // Phase 1: Thales API Discovery
        ]);

        const currentAzuroIds = new Set(azuroData.map(e => e.id));
        const currentOvertimeIds = new Set(overtimeData.map(e => e.id));

        const isAzuroIdentical = [...currentAzuroIds].every(id => previousAzuroIds.has(id)) && currentAzuroIds.size === previousAzuroIds.size;
        const isOvertimeIdentical = [...currentOvertimeIds].every(id => previousOvertimeIds.has(id)) && currentOvertimeIds.size === previousOvertimeIds.size;

        const azuroNames = azuroData.map(e => e.name);
        const overtimeNames = overtimeData.map(e => e.name);

        const azuroListStr = `${C.magenta}${C.bold}🅰️  Azuro (${azuroData.length})${C.reset}\n` + azuroData.map(e => `  ${C.dim}├─${C.reset} ${C.white}${e.name}${C.reset} ${C.cyan}[${(e.odds || []).join(', ')}]${C.reset}`).join('\n');
        const overtimeListStr = `${C.blue}${C.bold}🅾️  Overtime (${overtimeData.length})${C.reset}\n` + overtimeData.map(e => `  ${C.dim}├─${C.reset} ${C.white}${e.name}${C.reset} ${C.cyan}[${(e.odds || []).join(', ')}]${C.reset}`).join('\n');

        if (isAzuroIdentical && isOvertimeIdentical && (azuroData.length > 0 || overtimeData.length > 0)) {
            // Log quietly to file instead of spamming terminal
            const logMsg = `[${new Date().toISOString()}] No new matches.\n${azuroListStr}\n${overtimeListStr}\n-------------------------\n`;

            // Maintain a maximum of 10 blocks in the log file
            try {
                fs.appendFileSync('discovery_history.log', logMsg);
                const fileBuf = fs.readFileSync('discovery_history.log', 'utf8');
                // Split lines by the block separator, take the last 10 blocks, and re-join them
                const blocks = fileBuf.split('-------------------------\n').filter(b => b.trim() !== '');
                if (blocks.length > 10) {
                    const tenLastBlocks = blocks.slice(-10).join('-------------------------\n') + '-------------------------\n';
                    fs.writeFileSync('discovery_history.log', tenLastBlocks);
                }
            } catch (fsError) {
                logger.error(`[FS Logs Error] ${fsError.message}`);
            }

            logger.debug(`${C.dim}💤 [Discovery] No change from last cycle. Logged to file.${C.reset}`);
        } else {
            // New events discovered, log them directly to the console
            logger.info(`\n${C.bgBlue}${C.white}${C.bold} 🆕  NEW EVENTS DISCOVERED ${C.reset}`);
            logger.info(azuroListStr);
            logger.info(overtimeListStr);

            previousAzuroIds = currentAzuroIds;
            previousOvertimeIds = currentOvertimeIds;
        }

        const matchedPairs = hydrateDictionaryByCompositeKey(azuroData, overtimeData);
        if (matchedPairs.length > 0) {
            logger.info(`${C.green}${C.bold}🔗 Found ${matchedPairs.length} matched pair(s)${C.reset} out of ${azuroData.length} Azuro markets!`);
        } else {
            logger.debug(`${C.dim}🔗 0 matched pairs out of ${azuroData.length} Azuro markets${C.reset}`);
        }

        // --- PHASE 2: REAL-TIME ARBITRAGE (Smart Contracts) ---
        if (matchedPairs.length > 0) {
            // Dynamic Gas Fetching via Oracle
            const avgPolygonGas = await gasOracle.getGasCostInUsd('polygon');
            const avgArbitrumGas = await gasOracle.getGasCostInUsd('arbitrum') || 0.10; // Arbitrum fallback
            logger.info(`${C.yellow}⛽ [Gas Oracle]${C.reset} Polygon ${C.green}$${avgPolygonGas.toFixed(2)}${C.reset} | Arbitrum ${C.green}$${avgArbitrumGas.toFixed(2)}${C.reset}`);

            for (const pair of matchedPairs) {
                const subAz = pair.eventA;
                const subOv = pair.eventB;

                // ── BET DEDUPLICATION: Skip if already placed ──
                const betKey = `${subAz.id}_${subOv.id}`;
                if (placedBets.has(betKey)) {
                    logger.debug(`${C.dim}⏭️  Skipping [${subAz.name}] — bet already placed in a previous cycle.${C.reset}`);
                    continue;
                }

                logger.info(`${C.cyan}🔍 Validating${C.reset} [${C.bold}${subAz.name}${C.reset}] on-chain...`);
                let liveAzuro = { isFrozen: false, odds: subAz.odds };
                let liveOvertime = { isFrozen: false, odds: subOv.odds };

                if (process.env.POLYGON_WS_URL) {
                    liveAzuro = await azuroFetcher.getLatestOddsFromContract(AZURO_LP_CONTRACT, subAz.id);
                }

                if (process.env.ARBITRUM_RPC_URL) {
                    liveOvertime = await overtimeFetcher.getLatestOddsFromContract(subOv.id, TOTAL_INVESTMENT);
                }

                if (liveAzuro.odds.length === 0) {
                    // Do not fallback to Phase 1 data; if it fails on-chain, treat as frozen/unavailable.
                    liveAzuro.isFrozen = true;
                }
                if (liveOvertime.odds.length === 0) {
                    // Do not fallback to Phase 1 dummy data; if it fails on-chain, treat as frozen/unavailable.
                    liveOvertime.isFrozen = true;
                }

                const result = calculateArbitrageOpportunity(
                    subAz.name,
                    liveAzuro.odds, // Array of all outcomes on Azuro
                    liveOvertime.odds, // Array of all outcomes on Overtime (with Slippage applied)
                    TOTAL_INVESTMENT,
                    avgPolygonGas,
                    avgArbitrumGas,
                    AZURO_COMMISSION,
                    OVERTIME_COMMISSION,
                    liveAzuro.isFrozen,
                    liveOvertime.isFrozen
                );

                if (result.isArbitrage) {
                    // Attach the specific matchId to the payload
                    result.matchId = subAz.id;
                    logger.info(`\n${C.bgGreen}${C.white}${C.bold} 🚨  SUREBET DETECTED  🚨 ${C.reset}`);
                    logger.info(`${C.green}${C.bold}💰 Net Profit: ${result.profitPercentage.toFixed(2)}% | Amount: $${result.minNetProfit.toFixed(2)}${C.reset}`);
                    logger.info(`${C.yellow}⚡ Triggering ExecutionEngine...${C.reset}`);

                    // Fire the Execution Engine to broadcast trades
                    await require('./src/engine/ExecutionEngine').evaluateAndExecute(result);

                    // ── Mark this bet as placed to avoid duplicates ──
                    placedBets.add(betKey);
                    logger.info(`${C.dim}📝 Bet registered in dedup cache (${placedBets.size} total placed bets)${C.reset}`);
                }
            }
        }

    } catch (e) {
        logger.error(`Critical Error in Discovery Cycle: ${e.message}`);
        if (e.stack) logger.error(e.stack);
    } finally {
        isDiscoveryRunning = false;
        logger.debug(`${C.dim}😴 Sleeping ${DISCOVERY_INTERVAL_MS / 1000}s until next cycle... (${placedBets.size} bets placed so far)${C.reset}`);
    }
}

// ---------------------------------------------------------
// INITIALIZATION SEQUENCE
// ---------------------------------------------------------

logger.info(`${C.bgMagenta}${C.white}${C.bold}                                              ${C.reset}`);
logger.info(`${C.bgMagenta}${C.white}${C.bold}   🤖  Web3-Arb-Sentry   ·   PRODUCTION MODE   ${C.reset}`);
logger.info(`${C.bgMagenta}${C.white}${C.bold}                                              ${C.reset}`);
logger.info(`${C.cyan}📊 Investment: ${C.bold}$${TOTAL_INVESTMENT}${C.reset} ${C.dim}|${C.reset} ${C.cyan}🔄 Interval: ${C.bold}${DISCOVERY_INTERVAL_MS / 1000}s${C.reset} ${C.dim}|${C.reset} ${C.cyan}🎯 Dedup: ${C.green}ON${C.reset}`);

// 1. Trigger the very first Discovery loop instantly
runDiscoveryCycle();

// 2. Schedule infinite Discovery loops every 2 minutes
setInterval(runDiscoveryCycle, DISCOVERY_INTERVAL_MS);

// 3. Schedule infinite Claim Engine polling every 1 minute
if (process.env.AUTO_CLAIM === 'true') {
    logger.info(`${C.green}✅ ClaimEngine${C.reset} auto-claim polling started (every ${CLAIM_INTERVAL_MS / 1000}s)`);
    setInterval(async () => {
        try {
            const claimEngine = require('./src/engine/ClaimEngine');
            await claimEngine.processResolutions();
        } catch (err) {
            logger.error(`[ClaimEngine Loop Error] ${err.message}`);
        }
    }, CLAIM_INTERVAL_MS);
} else {
    logger.warn(`${C.yellow}⚠️  AUTO_CLAIM is disabled${C.reset} — the bot will NOT auto-cash winning bets.`);
}
