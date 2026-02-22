const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');
const SourcifyService = require('./sourcifyService');

class AbiService {
    constructor(network) {
        this.network = network;
        this.netConfig = config.networks[network];
        if (!this.netConfig) {
            throw new Error(`Network ${network} is not configured.`);
        }
    }

    async getAbi(address, chainId) {
        logger.info(`Fetching ABI for ${address} on ${this.network}...`);

        let abi = await this.fetchFromExplorer(address);
        if (abi) return abi;

        abi = await SourcifyService.getAbi(address, chainId);
        if (abi) return abi;

        abi = await this.fetchFromAbiData(address);
        if (abi) return abi;

        return null;
    }

    async fetchFromExplorer(address) {
        let retries = 0;
        const url = `${this.netConfig.api}?module=contract&action=getabi&address=${address}&apikey=${this.netConfig.apiKey}`;

        while (retries < config.maxRetries) {
            try {
                logger.info(`Attempting fetch from Explorer API (Try ${retries + 1}/${config.maxRetries})...`);
                const response = await axios.get(url, { timeout: config.timeout });

                if (response.data.status === '1' && response.data.result) {
                    logger.success(`Successfully recovered ABI from Explorer.`);
                    return JSON.parse(response.data.result);
                }

                if (response.data.message === 'NOTOK' && response.data.result.includes('Max rate limit')) {
                    logger.warn('Explorer Rate limit hit. Waiting 2 seconds...');
                    await new Promise(r => setTimeout(r, 2000));
                    retries++;
                    continue;
                }

                logger.warn(`Explorer API response: ${response.data.result}`);
                return null;
            } catch (err) {
                logger.error(`Explorer Request Error: ${err.message}`);
                retries++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        return null;
    }

    async fetchFromAbiData(address) {
        logger.info(`Attempting to fetch ABI from abidata.net...`);
        try {
            const response = await axios.get(`https://abidata.net/${address}`, { timeout: config.timeout });
            if (response.data && response.data.abi) {
                logger.success(`Successfully recovered ABI from abidata.net.`);
                return response.data.abi;
            }
        } catch {
            logger.info(`abidata.net fetch failed.`);
        }
        return null;
    }
}

module.exports = AbiService;
