const axios = require('axios');
const { ethers } = require('ethers');
const { logger } = require('../engine/ArbitrageEngine');

const { request, gql } = require('graphql-request');

class OvertimeFetcher {
    /**
     * @param {string} apiUrl - The Overtime API Endpoint
     * @param {string} rpcUrl - Arbitrum RPC URL for slippage quotes
     * @param {string} ammContractAddress - Overtime Sports AMM address
     */
    constructor(apiUrl, rpcUrl, ammContractAddress) {
        this.apiUrl = apiUrl || process.env.OVERTIME_API_URL;
        this.apiKey = process.env.THEGRAPH_API_KEY;
        this.provider = new ethers.JsonRpcProvider(rpcUrl || process.env.ARBITRUM_RPC_URL);
        this.ammContractAddress = ammContractAddress || process.env.OVERTIME_SPORTS_AMM_ARBITRUM;

        // Overtime AMM Minimal ABI for Slippage Quoting
        // buyFromAmmQuote(market, position, amount) returns (quote)
        this.ammAbi = [
            "function buyFromAmmQuote(address market, uint8 position, uint256 amount) view returns (uint256)"
        ];
        this.ammContract = new ethers.Contract(this.ammContractAddress, this.ammAbi, this.provider);
    }

    /**
     * PHASE 1: DISCOVERY
     * Fetches active matches via TheGraph API to build the initial Dictionary Hydration map.
     */
    async fetchActiveEvents() {
        try {
            logger.debug(`OvertimeFetcher: Fetching active events from TheGraph API (${this.apiUrl})...`);

            const query = gql`{
              sportMarkets(first: 150, where: { isOpen: true, isCanceled: false, isPaused: false }, orderBy: maturityDate, orderDirection: asc) {
                address
                maturityDate
                homeTeam
                awayTeam
                tags
              }
            }`;

            const headers = {
                Authorization: `Bearer ${this.apiKey}`
            };

            const data = await request(this.apiUrl, query, {}, headers);
            const liveEvents = data.sportMarkets;

            if (!liveEvents || !Array.isArray(liveEvents)) {
                logger.warn(`OvertimeFetcher: Expected array from TheGraph API but got missing data.`);
                return [];
            }

            logger.debug(`OvertimeFetcher: Found ${liveEvents.length} active markets on TheGraph. Formulating Dictionary Mapping...`);

            // Overtime uses numerical tags for Sports
            // e.g. 9002 = Football, 9003 = Baseball, 9004 = Basketball, 9006 = Hockey, 9010 = Soccer (Global Football), 9015 = MMA
            const overtimeTagToSport = {
                9002: "Football",
                9003: "Baseball",
                9004: "Basketball",
                9006: "Hockey",
                9010: "Football", // Azuro calls soccer Football
                9011: "Football",
                9012: "Football",
                9013: "Football",
                9014: "Football",
                9015: "MMA",
                9016: "Motorsport",
                9018: "Football",
                9019: "Football",
                9020: "Boxing",
                109021: "Golf",
                109121: "Golf"
            };

            const discoveredMarkets = [];

            for (let e of liveEvents) {
                try {
                    const startTimeUnix = parseInt(e.maturityDate);

                    const teamLeft = e.homeTeam || 'Team A';
                    const teamRight = e.awayTeam || 'Team B';
                    const eventName = `${teamLeft} vs ${teamRight}`;

                    // Extract sport from tags array (e.g. ['9004', '90041'])
                    let sportName = 'Unknown';
                    if (e.tags && e.tags.length > 0) {
                        const primaryTag = parseInt(e.tags[0]);
                        sportName = overtimeTagToSport[primaryTag] || `Unknown (${primaryTag})`;
                    }

                    const marketObj = {
                        id: e.address, // Market Contract Address on Arbitrum
                        protocol: 'overtime',
                        name: eventName,
                        sport: sportName,
                        marketName: 'Match Winner', // Baseline dictionary enforcement
                        startTime: startTimeUnix,
                        // We extract dummy/API odds here just to satisfy the array length requirements initially.
                        // We will overlay EXACT on-chain slippage logic in Phase 2 via RPCs.
                        odds: [2.0, 2.0]
                    };

                    discoveredMarkets.push(marketObj);
                } catch (mapErr) {
                    // Skip malformed entries
                }
            }

            logger.debug(`OvertimeFetcher: Successfully formulated ${discoveredMarkets.length} active market(s) for Hydration.`);
            return discoveredMarkets;

        } catch (error) {
            logger.error(`Overtime API Discovery Error: ${error.message}`);
            return [];
        }
    }

    /**
     * PHASE 2: VALIDATION
     * Performs a direct JSON-RPC call to the Arbitrum Overtime AMM using ethers.js
     * to extract the exact real-time quote (slippage included) for the specific trade size.
     */
    async getLatestOddsFromContract(marketAddress, targetStakeUsd) {
        let isFrozen = false;
        const trueOddsArray = [];
        const targetAmountWei = ethers.parseUnits(targetStakeUsd.toString(), 6); // USDC Arbitrum is 6 decimals

        try {
            // Defaulting to 3 potential positions (Home, Away, Draw). If Draw reverts, it's a 2-way market.
            for (let i = 0; i < 3; i++) {
                try {
                    // 📡 LIVE ARBITRUM SMART CONTRACT CALL to Overtime AMM
                    const quoteWei = await this.ammContract.buyFromAmmQuote(marketAddress, i, targetAmountWei);
                    const quoteUsdc = parseFloat(ethers.formatUnits(quoteWei, 6));

                    // Implied decimal odd factoring in exact AMM curve and base fees
                    const impliedOddsWithSlippage = targetStakeUsd / quoteUsdc;
                    trueOddsArray.push(Number(impliedOddsWithSlippage.toFixed(3)));
                } catch (quoteErr) {
                    // If position 2 fails, it just means it's a 2-way market (no Draw). 
                    // If position 0/1 fails, the market might be paused or exhausted.
                    if (i < 2) isFrozen = true;
                    break;
                }
            }
            return { isFrozen, odds: trueOddsArray };
        } catch (error) {
            logger.error(`[Arbitrum RPC] Overtime AMM Quote failed for ${marketAddress}: ${error.message}`);
            return { isFrozen: true, odds: [] };
        }
    }
}

module.exports = OvertimeFetcher;
