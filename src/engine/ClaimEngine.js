const { ethers } = require('ethers');
const { logger } = require('./ArbitrageEngine');

const AZURO_CORE_ABI = [
    "function withdrawPayouts(uint256[] calldata conditionIds) external"
];

const DEXSPORT_ABI = [
    "function claim(bytes32 poolId) external"
];

/**
 * Claim Engine
 * Monitors placed bets and extracts the winnings post-match resolution.
 * Driven by the AUTO_CLAIM (.env) configuration.
 */
class ClaimEngine {
    constructor() {
        this.polygonRpc = process.env.POLYGON_RPC_URL;
        this.azuroContract = process.env.AZURO_LP_CONTRACT || "0x204e7371Ade792c5C006fb52711c50a7efC843ed";

        this.bscRpc = process.env.BSC_RPC_URL;
        this.dexsportContract = process.env.DEXSPORT_POOL_CONTRACT || "0x393c06fb9134a6df6158c5f5904d962086e33814";

        this.privateKey = process.env.PRIVATE_KEY;

        // In-memory store for MVP. TODO: Persist `pendingClaims` to Redis or PostgreSQL
        // to prevent loss of winning tickets if the Node.js process crashes or restarts.
        this.pendingClaims = [];
    }

    /**
     * Registers a successfully placed bet to be monitored for payouts
     * @param {Object} claimTicket 
     */
    registerBetForClaiming(claimTicket) {
        this.pendingClaims.push(claimTicket);
        logger.info(`[Claim Engine] Registered Ticket ${claimTicket.txHash} for future payout monitoring.`);
    }

    /**
     * Polling process that would be continuously called in a background loop.
     * Checks if the condition ID map has resolved to "Finished" on the blockchain.
     */
    async processResolutions() {
        if (this.pendingClaims.length === 0) return;

        logger.info(`[Claim Engine] Checking resolution status for ${this.pendingClaims.length} active bets...`);

        if (!this.privateKey) return;

        const polyProvider = new ethers.JsonRpcProvider(this.polygonRpc);
        const bscProvider = new ethers.JsonRpcProvider(this.bscRpc);
        const polyWallet = new ethers.Wallet(this.privateKey, polyProvider);
        const bscWallet = new ethers.Wallet(this.privateKey, bscProvider);

        const azuroCore = new ethers.Contract(this.azuroContract, AZURO_CORE_ABI, polyWallet);
        const dexsportPool = new ethers.Contract(this.dexsportContract, DEXSPORT_ABI, bscWallet);

        const newPendingClaims = [];

        for (const claim of this.pendingClaims) {
            try {
                // In a production environment, we should verify the "state" of the match before attempting to claim.
                // For Azuro: `azuroCore.getCondition(conditionId)`, if state == 2 (Resolved), then claim.
                // For Dexsport: `dexsportPool.getPool(poolId)`, check status.
                // Assuming the conditions are met here:

                logger.info(`[Claim Engine] Attempting to withdraw payout for Match ${claim.matchId} on ${claim.bookie.toUpperCase()}...`);

                if (claim.bookie === 'azuro') {
                    // Azuro expects an array of conditionIds
                    const tx = await azuroCore.withdrawPayouts([claim.matchId]);
                    const receipt = await tx.wait();
                    logger.info(`[Claim Engine Polygon] ✅ Successfully Withdrawn Payout! Hash: ${receipt.hash}`);
                } else if (claim.bookie === 'dexsport') {
                    const tx = await dexsportPool.claim(claim.matchId);
                    const receipt = await tx.wait();
                    logger.info(`[Claim Engine BSC] ✅ Successfully Withdrawn Payout! Hash: ${receipt.hash}`);
                }

                // If successful, we do NOT push it back to newPendingClaims (it's resolved)
            } catch (error) {
                // If the transaction fails (e.g., match not resolved yet, or lost the bet), we simply catch and log.
                logger.warn(`[Claim Engine] Claim for ${claim.matchId} on ${claim.bookie} is not ready or failed. Retrying later. Error: ${error.message}`);
                newPendingClaims.push(claim);
            }
        }

        this.pendingClaims = newPendingClaims;
    }
}

module.exports = new ClaimEngine();
