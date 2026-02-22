#!/usr/bin/env node

const { Command } = require('commander');
const { ethers } = require('ethers');
const fs = require('fs/promises');
const path = require('path');

const logger = require('./utils/logger');
const config = require('./utils/config');
const { isValidAddress, isValidAbi } = require('./utils/validators');

const AbiService = require('./services/abiService');
const ProxyDetector = require('./services/proxyDetector');
const BytecodeAnalyzer = require('./services/bytecodeAnalyzer');

const program = new Command();

program
    .name('evm-abi-recovery')
    .description('EVM Smart Contract ABI Recovery Tool')
    .version('1.0.0')
    .argument('<address>', 'The smart contract address')
    .requiredOption('-n, --network <network>', 'Network to query (ethereum, bsc, polygon, arbitrum, avalanche)')
    .action(async (address, options) => {
        try {
            logger.info('======================================');
            logger.info('🚀 Starting EVM ABI Recovery Tool');
            logger.info('======================================');

            if (!isValidAddress(address)) {
                logger.error('Invalid contract address provided.');
                process.exit(1);
            }

            const networkStr = options.network.toLowerCase();
            if (!config.networks[networkStr]) {
                logger.error(`Unsupported network: ${networkStr}. Supported: ${Object.keys(config.networks).join(', ')}`);
                process.exit(1);
            }

            const rpcUrl = config.networks[networkStr].rpc;
            logger.info(`Connecting to ${networkStr} via RPC: ${rpcUrl}`);
            const provider = new ethers.JsonRpcProvider(rpcUrl);

            // Verify if contract actually exists
            const code = await provider.getCode(address);
            if (code === '0x') {
                logger.error(`No contract deployed at ${address} on ${networkStr}.`);
                process.exit(1);
            }

            const abiService = new AbiService(networkStr);
            const proxyDetector = new ProxyDetector(provider);
            const bytecodeAnalyzer = new BytecodeAnalyzer(provider);

            let targetAddress = address;

            // Step 1: Proxy Detection
            const implAddress = await proxyDetector.detectProxy(targetAddress);
            if (implAddress) {
                targetAddress = implAddress;
                // Save proxy info
                const proxyInfo = {
                    proxy: address,
                    implementation: implAddress,
                    network: networkStr
                };
                await fs.writeFile(path.join(process.cwd(), 'proxy_info.json'), JSON.stringify(proxyInfo, null, 2));
                logger.success(`Saved proxy_info.json`);
            }

            // Step 2: Multi-Source ABI Fetch
            const networkInfo = await provider.getNetwork();
            let abi = await abiService.getAbi(targetAddress, networkInfo.chainId);

            if (abi) {
                if (isValidAbi(abi)) {
                    const filename = 'abi.json';
                    await fs.writeFile(path.join(process.cwd(), filename), JSON.stringify(abi, null, 2));
                    logger.success(`Complete ABI successfully saved to ${filename}!`);
                    process.exit(0);
                } else {
                    logger.error(`Fetched object is not a valid ABI array.`);
                }
            }

            // Step 3: Bytecode Fallback
            logger.warn('Complete ABI could not be retrieved. Initiating bytecode fallback analysis...');
            const partialAbi = await bytecodeAnalyzer.analyze(targetAddress);
            if (partialAbi) {
                const filename = 'abi_partial.json';
                await fs.writeFile(path.join(process.cwd(), filename), JSON.stringify(partialAbi, null, 2));
                logger.success(`Partial ABI (Selectors extracted) successfully saved to ${filename}!`);
                process.exit(0);
            }

            logger.error('Failed to recover any ABI representation.');
            process.exit(1);

        } catch (err) {
            logger.error(`Fatal error: ${err.message}`);
            process.exit(1);
        }
    });

program.parse(process.argv);
