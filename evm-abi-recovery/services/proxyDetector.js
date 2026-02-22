const { ethers } = require('ethers');
const logger = require('../utils/logger');

// EIP-1967 Logic contract slot
const EIP1967_LOGIC_SLOT = '0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC';
// EIP-1822 UUPS slot
const EIP1822_LOGIC_SLOT = '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7';

class ProxyDetector {
    constructor(provider) {
        this.provider = provider;
    }

    async detectProxy(address) {
        try {
            logger.info(`Checking proxy slots for ${address}...`);

            // Check EIP-1967 Logic Slot
            let storage = await this.provider.getStorage(address, EIP1967_LOGIC_SLOT);
            let implAddress = this.parseAddress(storage);
            if (implAddress && implAddress !== ethers.ZeroAddress) {
                logger.success(`Detected EIP-1967 Proxy. Implementation: ${implAddress}`);
                return implAddress;
            }

            // Check EIP-1822 UUPS Slot
            storage = await this.provider.getStorage(address, EIP1822_LOGIC_SLOT);
            implAddress = this.parseAddress(storage);
            if (implAddress && implAddress !== ethers.ZeroAddress) {
                logger.success(`Detected EIP-1822 UUPS Proxy. Implementation: ${implAddress}`);
                return implAddress;
            }

            // Check EIP-1167 Minimal Proxy (Bonus)
            const code = await this.provider.getCode(address);
            if (code.length === 92 && code.startsWith('0x363d3d373d3d3d363d73')) {
                const proxyAddress = '0x' + code.slice(22, 62);
                implAddress = ethers.getAddress(proxyAddress);
                logger.success(`Detected EIP-1167 Minimal Proxy. Implementation: ${implAddress}`);
                return implAddress;
            }

            logger.info(`No standard proxy signatures found for ${address}.`);
            return null;
        } catch (error) {
            logger.error(`Error detecting proxy: ${error.message}`);
            return null;
        }
    }

    parseAddress(storageValue) {
        if (!storageValue || storageValue === '0x') return null;
        const hex = ethers.toBeHex(storageValue, 32);
        const address = ethers.dataSlice(hex, 12);
        return ethers.getAddress(address);
    }
}

module.exports = ProxyDetector;
