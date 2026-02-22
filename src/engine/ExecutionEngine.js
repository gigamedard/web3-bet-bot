const { ethers } = require('ethers');
const { logger } = require('./ArbitrageEngine');

const AZURO_CORE_ABI = [
    "function putQuote(uint256 conditionId, uint64 outcomeId, uint256 minOdds, bytes calldata data) external payable",
    "function withdrawPayouts(uint256[] calldata conditionIds) external"
];

const OVERTIME_ABI = [
    "function buyFromAmm(address market, uint8 position, uint256 amount, uint256 expectedPayout, uint256 additionalSlippage) external",
    "function buyFromAmmQuote(address market, uint8 position, uint256 amount) view returns (uint256)",
    "function claim(address market) external" // Overtime uses a decentralized resolver contract for claiming
];

const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

/**
 * Execution Engine
 * Compiles and Broadcasts the final Arbitrage trades across both protocols.
 */
class ExecutionEngine {
    constructor() {
        this.autoClaim = process.env.AUTO_CLAIM === 'true';

        // Polygon Setup
        this.polygonRpc = process.env.POLYGON_RPC_URL;
        this.azuroContract = process.env.AZURO_LP_CONTRACT || "0x204e7371Ade792c5C006fb52711c50a7efC843ed";

        // Arbitrum Setup
        this.arbitrumRpc = process.env.ARBITRUM_RPC_URL;
        this.overtimeContract = process.env.OVERTIME_SPORTS_AMM_ARBITRUM || "0x170a5714112daEfF20E798B6e92e25B86Ea603C1";

        this.privateKey = process.env.PRIVATE_KEY;
    }

    /**
     * Entry hook from index.js
     */
    async evaluateAndExecute(arbitrageResult) {
        if (!arbitrageResult || !arbitrageResult.isArbitrage) {
            return false;
        }

        logger.info(`[Execution] Preparing transactions for Margin: ${arbitrageResult.margin}`);

        // Execution Engine now ALWAYS places the bets when evaluateAndExecute is called.
        // Wait to trigger downstream claim resolution modules based on AUTO_CLAIM.

        if (!this.privateKey || !this.polygonRpc || !this.arbitrumRpc) {
            logger.error(`[Execution Fallback] Missing EVM connectivity variables in .env. Execution Aborted.`);
            return false;
        }

        try {
            await this.broadcastLegs(arbitrageResult);

            // If AUTO_CLAIM is enabled, queue the successful bet IDs into a claim monitoring routine
            if (this.autoClaim) {
                logger.info(`[Execution] AUTO_CLAIM enabled. Tracking transaction IDs for post-match resolution payout.`);
                const claimEngine = require('./ClaimEngine');

                // Demo mapping logic for storing the bet data
                for (const leg of arbitrageResult.legs) {
                    claimEngine.registerBetForClaiming({
                        matchId: arbitrageResult.matchId,
                        bookie: leg.bookie,
                        outcomeIndex: leg.outcomeIndex,
                        stake: leg.stake,
                        txHash: `0xMOCKTX_${Date.now()}_${leg.bookie}`
                    });
                }
            } else {
                logger.info(`[Execution] AUTO_CLAIM disabled. Payouts remain in Protocols for manual withdrawal.`);
            }

            return true;
        } catch (error) {
            logger.error(`[Execution FATAL] Broadcasting failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Generates Ethers.js providers and fires parallel transactions
     */
    async broadcastLegs(arbitrageResult) {
        const polyProvider = new ethers.JsonRpcProvider(this.polygonRpc);
        const arbitrumProvider = this.arbitrumRpc.startsWith('wss')
            ? new ethers.WebSocketProvider(this.arbitrumRpc)
            : new ethers.JsonRpcProvider(this.arbitrumRpc);

        const polyWallet = new ethers.Wallet(this.privateKey, polyProvider);
        const arbitrumWallet = new ethers.Wallet(this.privateKey, arbitrumProvider);

        const promises = [];

        logger.info("=========================================");
        logger.info(`🛡️ EXECUTION ENGINE TRIGGERED 🛡️`);
        logger.info("=========================================");

        for (const leg of arbitrageResult.legs) {
            if (leg.bookie === 'azuro') {
                // Use Azuro's specific Stablecoin (USDT on Polygon has 6 decimals)
                const azuroStakeWei = ethers.parseUnits(leg.stake.toFixed(6), 6);
                logger.info(`[TX Built] Polygon -> Azuro | Outcome: ${leg.outcomeIndex}, Stake: ${ethers.formatUnits(azuroStakeWei, 6)} USDT`);

                const azuroCore = new ethers.Contract(this.azuroContract, AZURO_CORE_ABI, polyWallet);
                const azuroToken = new ethers.Contract(process.env.AZURO_STABLECOIN_POLYGON || "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ERC20_ABI, polyWallet);

                promises.push((async () => {
                    try {
                        const allowance = await azuroToken.allowance(polyWallet.address, this.azuroContract);
                        if (allowance < azuroStakeWei) {
                            logger.info(`[Polygon] Approving Azuro LP for ${ethers.formatUnits(azuroStakeWei, 6)} USDT...`);
                            const txApprove = await azuroToken.approve(this.azuroContract, azuroStakeWei);
                            await txApprove.wait();
                        }

                        // Assuming 'minOdds' is packed or handled via outcome arrays
                        const mockData = ethers.hexlify(ethers.toUtf8Bytes("Arbitrage Bot Trade"));

                        logger.info(`[Polygon] Broadcasting Azuro Trade...`);
                        const tx = await azuroCore.putQuote(arbitrageResult.matchId, leg.outcomeIndex, 100, mockData, { value: azuroStakeWei });
                        const receipt = await tx.wait();
                        logger.info(`[Polygon] ✅ Trade confirmed! Hash: ${receipt.hash}`);

                        return receipt;
                    } catch (error) {
                        logger.error(`[Polygon] Azuro TX failed: ${error.message}`);
                        throw error;
                    }
                })());
            } else if (leg.bookie === 'overtime') {
                // Use Overtime's specific Stablecoin (USDC on Arbitrum has 6 decimals)
                const overtimeStakeWei = ethers.parseUnits(leg.stake.toFixed(6), 6);
                logger.info(`[TX Built] Arbitrum -> Overtime | Position: ${leg.outcomeIndex}, Stake: ${ethers.formatUnits(overtimeStakeWei, 6)} USDC`);

                const overtimeAmm = new ethers.Contract(this.overtimeContract, OVERTIME_ABI, arbitrumWallet);
                const overtimeToken = new ethers.Contract(process.env.OVERTIME_STABLECOIN_ARBITRUM || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", ERC20_ABI, arbitrumWallet);

                promises.push((async () => {
                    try {
                        const allowance = await overtimeToken.allowance(arbitrumWallet.address, this.overtimeContract);
                        if (allowance < overtimeStakeWei) {
                            logger.info(`[Arbitrum] Approving Overtime AMM for ${ethers.formatUnits(overtimeStakeWei, 6)} USDC...`);
                            const txApprove = await overtimeToken.approve(this.overtimeContract, overtimeStakeWei);
                            await txApprove.wait();
                        }

                        // 2. Récupérer les frais de réseau actuels et ajouter un "Boost" de priorité
                        const feeData = await arbitrumProvider.getFeeData();
                        const txOptions = {
                            maxFeePerGas: feeData.maxFeePerGas,
                            // On ajoute un tout petit bonus pour que le validateur nous choisisse en premier
                            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas + ethers.parseUnits("0.01", "gwei")
                        };

                        logger.info(`[Arbitrum] Fetching exact quote to prevent MEV attacks...`);
                        // 3. Récupérer le gain minimum attendu (Sécurité Anti-Sandwich)
                        const expectedPayoutWei = await overtimeAmm.buyFromAmmQuote(arbitrageResult.matchId, leg.outcomeIndex, overtimeStakeWei);

                        logger.info(`[Arbitrum] Broadcasting Overtime Trade with Priority Gas...`);
                        // slippage = 2% (2e16 en wei)
                        const additionalSlippage = ethers.parseUnits("0.02", 18);

                        // 4. Exécution blindée
                        const tx = await overtimeAmm.buyFromAmm(
                            arbitrageResult.matchId,
                            leg.outcomeIndex,
                            overtimeStakeWei,
                            expectedPayoutWei, // <-- Le correctif vital ici
                            additionalSlippage,
                            txOptions // <-- Le boost de vitesse
                        );
                        const receipt = await tx.wait();
                        logger.info(`[Arbitrum] ✅ Trade confirmed! Hash: ${receipt.hash}`);

                        return receipt;
                    } catch (error) {
                        logger.error(`[Arbitrum] Overtime TX failed: ${error.message}`);
                        throw error;
                    }
                })());
            }
        }

        logger.info("[Execution] Broadcasting parallel transactions to Validators...");
        await Promise.allSettled(promises);
        logger.info("[Execution] ✅ Broadcast Sequence Complete!");
    }

    simulateDelay(bookie) {
        return new Promise(resolve => setTimeout(() => {
            logger.info(`[Network] TX accepted by ${bookie.toUpperCase()}`);
            resolve();
        }, 800));
    }
}

module.exports = new ExecutionEngine();
