const { ethers } = require('ethers');

function isValidAddress(address) {
    try {
        return ethers.isAddress(address);
    } catch {
        return false;
    }
}

function isValidAbi(abi) {
    try {
        let parsedAbi = abi;
        if (typeof abi === 'string') {
            parsedAbi = JSON.parse(abi);
        }

        if (!Array.isArray(parsedAbi)) return false;
        if (parsedAbi.length === 0) return true;

        for (const item of parsedAbi) {
            if (typeof item !== 'object' || item === null || !item.type) {
                return false;
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    isValidAddress,
    isValidAbi
};
