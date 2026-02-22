const logger = require('../utils/logger');

class BytecodeAnalyzer {
    constructor(provider) {
        this.provider = provider;
    }

    async analyze(address) {
        logger.info(`Attempting Bytecode Analysis for ${address}...`);
        try {
            const bytecode = await this.provider.getCode(address);
            if (bytecode === '0x') {
                logger.error('No bytecode found at this address.');
                return null;
            }

            const selectors = this.extractSelectors(bytecode);
            if (selectors.length === 0) {
                logger.warn('No clear PUSH4 function selectors found in bytecode.');
                return null;
            }

            logger.success(`Extracted ${selectors.length} raw function selectors from bytecode.`);

            // Build ABI
            const partialAbi = selectors.map(selector => ({
                type: 'function',
                name: `unknown_${selector}`,
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            }));

            // Bonus: Simple ERC20 check based on common selectors
            // 0x18160ddd = totalSupply(), 0x70a08231 = balanceOf(address), 0xa9059cbb = transfer(address,uint256)
            const isERC20 = selectors.includes('18160ddd') && selectors.includes('70a08231') && selectors.includes('a9059cbb');
            if (isERC20) {
                logger.info('💡 Bonus: This contract bytecode strongly resembles an ERC-20 Token!');
            }

            return partialAbi;
        } catch (error) {
            logger.error(`Bytecode analysis failed: ${error.message}`);
            return null;
        }
    }

    extractSelectors(bytecode) {
        const selectors = new Set();
        // Look for PUSH4 opcode (0x63) followed by 4 bytes
        let i = 2; // skip '0x'
        while (i < bytecode.length) {
            const opcode = bytecode.slice(i, i + 2);
            if (opcode === '63') {
                const selector = bytecode.slice(i + 2, i + 10);
                if (selector.length === 8) {
                    selectors.add(selector);
                }
                i += 10; // Jump the 4 bytes push
            } else {
                // Approximate sliding window
                i += 2;
            }
        }
        return Array.from(selectors);
    }
}

module.exports = BytecodeAnalyzer;
