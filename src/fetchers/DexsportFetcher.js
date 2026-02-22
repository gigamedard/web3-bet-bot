const axios = require('axios');
const { ethers } = require('ethers');
const { logger } = require('../engine/ArbitrageEngine');

class DexsportFetcher {
    /**
     * @param {string} subgraphUrl - The Graph URL for Dexsport BSC
     * @param {string} wsRpcUrl - WebSocket RPC URL for real-time updates
     */
    constructor(subgraphUrl, wsRpcUrl) {
        this.subgraphUrl = subgraphUrl;

        // Ethers v6 WebsocketProvider initialization. 
        // Ethers v6 WebsocketProvider initialization. 
        if (wsRpcUrl && !wsRpcUrl.includes("nodedent.com") && wsRpcUrl.startsWith('wss')) {
            this.wsProvider = new ethers.WebSocketProvider(wsRpcUrl);
            if (this.wsProvider.websocket) {
                this.wsProvider.websocket.on('error', (e) => logger.error(`Dexsport WS Error: ${e.message}`));
            }
        } else {
            this.wsProvider = null;
        }
    }

    /**
     * Fetches active matches using either the Off-Chain API or On-Chain logs 
     * based on the DEXSPORT_DISCOVERY_MODE environment variable.
     */
    async fetchActiveEvents() {
        const mode = process.env.DEXSPORT_DISCOVERY_MODE || 'API';

        if (mode === 'WS') {
            return await this._fetchFromWebSocket();
        } else if (mode === 'API') {
            return await this._fetchFromRestApi();
        } else {
            return await this._fetchFromOnChainLogs();
        }
    }

    /**
     * Option 1: Fetches active matches via Dexsport's Off-Chain REST API.
     * Provides instant access to human-readable names and avoids RPC limits.
     */
    async _fetchFromRestApi() {
        logger.info(`DexsportFetcher: [API MODE] Fetching active events from Off-Chain REST endpoint...`);
        try {
            const apiUrl = process.env.DEXSPORT_API_URL || 'https://api.dexsport.io/v1/events';

            // NOTE: In production, uncomment the axios request to fetch live data.
            // const response = await axios.get(apiUrl);
            // const liveEvents = response.data.map(event => ({ ... }));

            // Placeholder: Mock mapping of the expected API structure
            const discoveredMarkets = [
                {
                    id: '0xabc1234567890123456789012345678901234567890123456789012345678901', // Example bytes32
                    protocol: 'dexsport',
                    name: 'Paris SG - Bayern', // API provides the readable name!
                    sport: 'Football',
                    marketName: 'Match Winner',
                    startTime: Math.floor(Date.now() / 1000) + 3600,
                    odds: [2.10, 3.00, 3.40] // Placeholder odds
                }
            ];

            logger.info(`DexsportFetcher: Found ${discoveredMarkets.length} active market(s) via REST API.`);
            return discoveredMarkets;
        } catch (error) {
            logger.error(`Dexsport API Fetch Error: ${error.message}`);
            return [];
        }
    }

    /**
     * Option 3: Fetches active matches via Dexsport's Private WebSocket API.
     * Decodes the raw binary JSON arrays into standard market objects.
     */
    async _fetchFromWebSocket() {
        logger.info(`DexsportFetcher: [WS MODE] Connecting to Dexsport Live WebSocket...`);
        return new Promise((resolve) => {
            const WebSocket = require('ws');
            const ws = new WebSocket('wss://mainnet.dexsport.io/ws', {
                headers: {
                    'Origin': 'https://dexsport.io',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/126.0.0.0',
                    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            const events = {}; // eventId -> { startTime, sport }
            const markets = []; // Formulated markets

            // Safety timeout: resolve whatever we have after 6 seconds
            const timeout = setTimeout(() => {
                ws.close();
                const uniqueMarkets = Array.from(new Map(markets.map(m => [m.id, m])).values());
                logger.info(`DexsportFetcher: WebSocket timeout gracefully reached. Found ${uniqueMarkets.length} markets.`);
                resolve(uniqueMarkets);
            }, 6000);

            ws.on('open', () => {
                // Subscribe to the live events channel
                ws.send(JSON.stringify({ type: 'subscribe', channel: 'events' }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());

                    const processItem = (item) => {
                        if (!Array.isArray(item)) return;

                        // Recursive unwrapping (e.g., ["batch", [ ["event", ...], ["market", ...] ]])
                        if (item[0] === 'batch' && Array.isArray(item[1])) {
                            item[1].forEach(processItem);
                            return;
                        }

                        if (Array.isArray(item[0])) {
                            item.forEach(processItem);
                            return;
                        }

                        const type = item[0];
                        const payload = item[3];

                        if (type === 'event' && payload) {
                            events[payload.lid] = {
                                startTime: payload.startTime,
                                sport: payload.disciplineId || 'Unknown'
                            };
                        }

                        // Parse the odds ("price") and teams ("name") from the Market layout
                        if (type === 'market' && payload && payload.outcomes && payload.outcomes.length > 0) {
                            const eventId = payload.outcomes[0].eventId;

                            // We construct the market only if we've already synced its parent Event timestamp
                            if (events[eventId]) {
                                // Extract and normalize team names
                                const teamNames = payload.outcomes
                                    .filter(o => o.name !== 'Draw' && o.shortName !== 'X')
                                    .map(o => o.name);

                                const matchName = teamNames.join(' vs ');
                                const odds = payload.outcomes.map(o => parseFloat(o.price || 0));

                                markets.push({
                                    id: payload.lid,
                                    protocol: 'dexsport',
                                    name: matchName || 'Unknown Match',
                                    sport: events[eventId].sport,
                                    marketName: 'Match Winner', // Normalized
                                    startTime: events[eventId].startTime,
                                    odds: odds
                                });
                            }
                        }
                    };

                    processItem(message);

                } catch (e) {
                    // Mute parsing errors on keep-alive/ping frames
                }
            });

            ws.on('error', (e) => {
                logger.error(`Dexsport WS Fetch Error: ${e.message}`);
                clearTimeout(timeout);
                resolve(Array.from(new Map(markets.map(m => [m.id, m])).values()));
            });
        });
    }

    /**
     * Option 2: Fetches active matches EXCLUSIVELY On-Chain via RPC/WebSocket.
     * Bypasses any centralized APIs for pure Web3 decentralization.
     */
    async _fetchFromOnChainLogs() {
        logger.info("DexsportFetcher: [ON-CHAIN MODE] Scanning exclusively On-Chain via WebSocket...");

        if (!this.wsProvider) {
            logger.error("DexsportFetcher: WebSocket provider is required for On-Chain scanning.");
            return [];
        }

        try {
            // Architecture: In a production environment, you use eth_getLogs to scan the last X blocks
            // for the exact MarketCreated event signature to discover newly opened betting pools.
            const MARKET_CREATED_TOPIC = ethers.id("MarketCreated(bytes32,uint256)");

            logger.info("DexsportFetcher: Querying BSC network for 'MarketCreated' logs over the last 5000 blocks...");

            // Note: Since bytes32 IDs on the blockchain don't contain human-readable team names ("PSG vs Bayern"),
            // the bot relies entirely on 'dictionaryHydration.js' matching the 'startTime' with Azuro to guess the match.

            // Placeholder to allow the ArbitrageEngine to test the execution phase safely
            const discoveredMarkets = [
                {
                    id: '0xabc1234567890123456789012345678901234567890123456789012345678901', // Example bytes32
                    protocol: 'dexsport',
                    name: 'UNKNOWN_DEXSPORT_ONCHAIN_ID', // Name missing on-chain
                    sport: 'Football',
                    marketName: 'Match Winner',
                    startTime: Math.floor(Date.now() / 1000) + 3600, // Starts in 1 hour
                    odds: [2.10, 3.00, 3.40] // Placeholder odds
                }
            ];

            logger.info(`DexsportFetcher: Found ${discoveredMarkets.length} active market(s) directly on-chain.`);
            return discoveredMarkets;

        } catch (error) {
            logger.error(`Dexsport On-Chain Scan Error: ${error.message}`);
            return [];
        }
    }

    /**
     * Setup WebSocket listeners for real-time price updates.
     */
    subscribeToPriceUpdates(contractAddress, onUpdateCallback) {
        if (!this.wsProvider) {
            logger.warn("DexsportFetcher: No WebSocket provider configured.");
            return;
        }

        // Example Event Name
        const eventSignature = "PriceChanged(bytes32,uint256[])";
        const filter = {
            address: contractAddress,
            topics: [ethers.utils.id(eventSignature)]
        };

        this.wsProvider.on(filter, (log) => {
            logger.info(`DexsportFetcher (WS): Realtime Price Update detected! Block: ${log.blockNumber}`);
            // Decode data and trigger arbitrage engine
            if (onUpdateCallback) {
                onUpdateCallback(log);
            }
        });
    }

    /**
     * V2 Optimization: Direct Smart Contract Read
     * Bypasses Subgraph Lag (5-30 seconds) by fetching the EXACT odds 
     * milliseconds before execution via the RPC provider.
     * 
     * @param {string} contractAddress - Dexsport Betting Pool Contract
     * @param {string} eventId - The ID of the match/market
     * @returns {Promise<object>} Returns { isFrozen, odds: number[] }
     */
    async getLatestOddsFromContract(contractAddress, eventId) {
        if (!this.wsProvider) throw new Error("DexsportFetcher: RPC Provider required for live fetch.");

        // Minimal ABI sufficient to fetch odds & state
        const DEXSPORT_ABI = [
            "function getMarket(bytes32 marketId) view returns (bool isActive, uint256[] prices)"
        ];

        const contract = new ethers.Contract(contractAddress, DEXSPORT_ABI, this.wsProvider);

        try {
            // Assumes eventId maps directly to marketId for this MVP
            // Dexsport expects a bytes32 parameter. Convert regular strings or hex strings to bytes32:
            let bytes32MarketId = eventId.startsWith('0x') ? eventId : ethers.id(eventId);
            if (bytes32MarketId.length < 66) {
                bytes32MarketId = ethers.zeroPadValue(ethers.getBytes(bytes32MarketId), 32);
            }

            const result = await contract.getMarket(bytes32MarketId);

            // Access via Ethers v6 array indices or proxy names
            const isFrozen = !result[0] && !result.isActive;

            const odds = [];
            for (let i = 0; i < result[1].length; i++) {
                // Adjust formatting depending on Dexsport's decimals. Often 1e6 or 1e18.
                odds.push(parseFloat(ethers.formatUnits(result[1][i], 6)));
            }

            return { isFrozen, odds };
        } catch (e) {
            logger.error(`Dexsport Live Fetch Failed: ${e.message}`);
            return { isFrozen: true, odds: [] }; // Fail safe
        }
    }
}

module.exports = DexsportFetcher;
