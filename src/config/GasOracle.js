const { ethers } = require('ethers');
const { logger } = require('../engine/ArbitrageEngine');

class GasOracle {
    /**
     * @param {string} bscRpcUrl 
     * @param {string} polygonRpcUrl 
     */
    constructor(bscRpcUrl, polygonRpcUrl) {
        this.bscProvider = new ethers.JsonRpcProvider(bscRpcUrl);
        this.polygonProvider = new ethers.JsonRpcProvider(polygonRpcUrl);

        // Caching
        this.lastBscGasUsd = 0.5;
        this.lastPolygonGasUsd = 0.1;
        this.lastUpdate = 0;
        this.CACHE_DURATION_MS = 15000; // Update max every 15s
    }

    /**
     * Estimates the fiat (USD) cost of a transaction on a given chain.
     * @param {string} chain 'bsc' or 'polygon'
     * @param {number} estimatedGasLimit (ex: 200000 for a complex swap/bet)
     * @returns {Promise<number>} Gas cost in USD
     */
    async getGasCostInUsd(chain, estimatedGasLimit = 300000) {
        const now = Date.now();

        if (now - this.lastUpdate < this.CACHE_DURATION_MS) {
            return chain === 'bsc' ? this.lastBscGasUsd : this.lastPolygonGasUsd;
        }

        try {
            await this._updateGasPrices(estimatedGasLimit);
            return chain === 'bsc' ? this.lastBscGasUsd : this.lastPolygonGasUsd;
        } catch (error) {
            logger.error(`[GasOracle] Failed to update gas: ${error.message}. Using fallback values.`);
            return chain === 'bsc' ? 0.5 : 0.1; // Fallbacks
        }
    }

    async _updateGasPrices(gasLimit) {
        const [bscFeeData, polyFeeData] = await Promise.all([
            this.bscProvider.getFeeData(),
            this.polygonProvider.getFeeData()
        ]);

        const bscGasPrice = bscFeeData.gasPrice;
        const polyGasPrice = polyFeeData.gasPrice;

        // Cost in Native Token = gasPrice * gasLimit
        // Ethers v6 uses native BigInt operations instead of .mul()
        const bscCostNative = ethers.formatEther(bscGasPrice * BigInt(gasLimit));
        const polyCostNative = ethers.formatEther(polyGasPrice * BigInt(gasLimit));

        // For USD conversion, we need the price of BNB and MATIC (POL).
        // Ideally fetch from an oracle (e.g. Chainlink or Binance API).
        // For speed in this MVP we use approximate fixed values or a rapid API call.
        const bnbPrice = await this._getMockTokenPrice('BNB');
        const maticPrice = await this._getMockTokenPrice('MATIC');

        this.lastBscGasUsd = parseFloat(bscCostNative) * bnbPrice;
        this.lastPolygonGasUsd = parseFloat(polyCostNative) * maticPrice;
        this.lastUpdate = Date.now();

        logger.info(`[GasOracle] Updated Live Gas: BSC ~$${this.lastBscGasUsd.toFixed(3)}, Polygon ~$${this.lastPolygonGasUsd.toFixed(3)}`);
    }

    // Replace this with a fast Binance or Coingecko API call in production
    async _getMockTokenPrice(symbol) {
        if (symbol === 'BNB') return 380; // Example
        if (symbol === 'MATIC') return 1.05; // Example
        return 1;
    }
}

module.exports = GasOracle;
