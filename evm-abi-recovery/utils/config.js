require('dotenv').config();

const config = {
    networks: {
        ethereum: {
            rpc: process.env.ETH_RPC_URL || 'https://cloudflare-eth.com',
            api: 'https://api.etherscan.io/api',
            apiKey: process.env.ETHERSCAN_API_KEY || ''
        },
        bsc: {
            rpc: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
            api: 'https://api.bscscan.com/api',
            apiKey: process.env.BSCSCAN_API_KEY || ''
        },
        polygon: {
            rpc: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
            api: 'https://api.polygonscan.com/api',
            apiKey: process.env.POLYGONSCAN_API_KEY || ''
        },
        arbitrum: {
            rpc: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
            api: 'https://api.arbiscan.io/api',
            apiKey: process.env.ARBISCAN_API_KEY || ''
        },
        avalanche: {
            rpc: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
            api: 'https://api.snowtrace.io/api',
            apiKey: process.env.SNOWTRACE_API_KEY || ''
        }
    },
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    timeout: parseInt(process.env.TIMEOUT_MS || '10000')
};

module.exports = config;
