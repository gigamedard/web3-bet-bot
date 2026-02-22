const pino = require('pino');

// Initialize super-fast logger
const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard'
        }
    }
});

/**
 * Evaluates the arbitrage opportunity between two odds,
 * taking into account network Gas Fees and protocol commissions.
 * 
 * @param {string} matchId - Unique ID or Name for logging.
 * @param {number} oddsA - Decimal odds from Protocol A (e.g. Azuro)
 * @param {number} oddsB - Decimal odds from Protocol B (e.g. Dexsport)
 * @param {number} totalInvestment - The total amount in USD (or base stablecoin) to stake across both.
 * @param {number} gasFeeA - Expected transaction gas cost for Chain A in USD.
 * @param {number} gasFeeB - Expected transaction gas cost for Chain B in USD.
 * @param {number} commissionA - Protocol commission rate on A (e.g. 0.05 for 5%)
 * @param {number} commissionB - Protocol commission rate on B (e.g. 0.05 for 5%)
 * @param {boolean} isMarketFrozenA - If the protocol market on A is Suspended/Paused
 * @param {boolean} isMarketFrozenB - If the protocol market on B is Suspended/Paused
 * @returns {object} The arbitrage calculation result.
 */
function calculateArbitrageOpportunity(
    matchId,
    azuroOddsArray,
    dexsportOddsArray,
    totalInvestment,
    gasFeeA = 0,
    gasFeeB = 0,
    commissionA = 0,
    commissionB = 0,
    isMarketFrozenA = false,
    isMarketFrozenB = false
) {
    // 0. Safety Check: Market Suspension
    if (isMarketFrozenA || isMarketFrozenB) {
        logger.warn(`[Suspension Shield] Arbitrage ignored for ${matchId} - Market is Closed/Frozen.`);
        return { isArbitrage: false, margin: 0, reason: "Market Suspended" };
    }

    if (!azuroOddsArray || !dexsportOddsArray || azuroOddsArray.length === 0) {
        return { isArbitrage: false, margin: 0, reason: "Odds missing" };
    }

    // Safety Check: Multi-Market Protection
    if (azuroOddsArray.length !== dexsportOddsArray.length) {
        logger.warn(`[Suspension Shield] Arbitrage blocked for ${matchId} - Array length mismatch (Azuro ${azuroOddsArray.length} vs Dexsport ${dexsportOddsArray.length}) denotes inconsistent Market Types.`);
        return { isArbitrage: false, margin: 0, reason: "Odds array length mismatch" };
    }

    const numOutcomes = azuroOddsArray.length;
    let margin = 0;
    const bestOdds = [];
    let usesAzuro = false;
    let usesDexsport = false;

    // 1. Find the best effective odd for each outcome covering ALL possibilities
    for (let i = 0; i < numOutcomes; i++) {
        const effAzuro = (azuroOddsArray[i] || 0) * (1 - commissionA);
        const effDexsport = (dexsportOddsArray[i] || 0) * (1 - commissionB);

        if (effAzuro === 0 && effDexsport === 0) return { isArbitrage: false, margin: 0, reason: "Zero odds on an outcome" };

        let bestBookie, bestEffOdd, rawOdd;
        if (effAzuro > effDexsport) {
            bestEffOdd = effAzuro;
            rawOdd = azuroOddsArray[i];
            bestBookie = 'azuro';
            usesAzuro = true;
        } else {
            bestEffOdd = effDexsport;
            rawOdd = dexsportOddsArray[i];
            bestBookie = 'overtime';
            usesDexsport = true;
        }

        if (bestEffOdd <= 0) return { isArbitrage: false, margin: 0, reason: "Zero odds on best outcome" };

        bestOdds.push({ outcomeIndex: i, bookie: bestBookie, effOdd: bestEffOdd, rawOdd });
        margin += 1 / bestEffOdd;
    }

    // Fast fail if margin >= 1 (No arbitrage exists)
    if (margin >= 1) {
        return { isArbitrage: false, margin };
    }

    // 2. We have a mathematical surebet covering ALL outcomes. Calculate optimal stakes.
    for (let i = 0; i < numOutcomes; i++) {
        const stake = totalInvestment * (1 / bestOdds[i].effOdd) / margin;
        bestOdds[i].stake = stake;
    }

    // 3. Subtract total gas fees depending on which networks are routed
    let totalGasCost = 0;
    if (usesAzuro) totalGasCost += gasFeeA;
    if (usesDexsport) totalGasCost += gasFeeB;

    const netReturn = totalInvestment / margin;
    let trueNetProfit = netReturn - totalInvestment - totalGasCost;

    // Safety buffer: If profit doesn't cover total Gas, it's not a true arbitrage
    const isProfitable = trueNetProfit > 0;
    const profitPercentage = (trueNetProfit / totalInvestment) * 100;

    // Logging the dynamic N-Way distribution
    logger.info({
        msg: `N-Way Arbitrage Check: ${matchId}`,
        margin: margin.toFixed(4),
        expectedProfit: `$${trueNetProfit.toFixed(2)} (${profitPercentage.toFixed(2)}%)`,
        distribution: bestOdds.map(b => `${b.bookie.toUpperCase()} [Outcome ${b.outcomeIndex}]: $${b.stake.toFixed(2)} @ ${b.rawOdd}`)
    });

    return {
        isArbitrage: isProfitable,
        matchId,
        profitPercentage,
        minNetProfit: trueNetProfit,
        legs: bestOdds,
        gasCosts: totalGasCost
    };
}

module.exports = {
    calculateArbitrageOpportunity,
    logger
};
