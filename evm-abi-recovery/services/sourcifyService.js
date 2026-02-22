const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');

class SourcifyService {
    static async getAbi(address, chainId) {
        logger.info(`Attempting to fetch ABI from Sourcify (Chain ID: ${chainId})...`);
        const url = `https://sourcify.dev/server/files/any/${chainId}/${address}`;
        try {
            const response = await axios.get(url, { timeout: config.timeout });
            if (response.data && response.data.files) {
                const metadataFile = response.data.files.find(f => f.name === 'metadata.json');
                if (metadataFile) {
                    const metadata = JSON.parse(metadataFile.content);
                    if (metadata.output && metadata.output.abi) {
                        logger.success(`Successfully recovered ABI from Sourcify.`);
                        return metadata.output.abi;
                    }
                }
            }
            return null;
        } catch (error) {
            logger.info(`Sourcify fetch failed or contract not verified there.`);
            return null;
        }
    }
}

module.exports = SourcifyService;
