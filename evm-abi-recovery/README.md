# EVM ABI Recovery Tool

An advanced Node.js CLI tool designed to reliably extract and mathematically reconstruct the `abi.json` of any EVM Smart Contract across multiple networks.

## Core Capabilities
1. **Multi-Source Fetching**: Explores Block Explorers (Etherscan API) and Sourcify to find verified ABIs.
2. **Proxy Resolution**: Automatically detects EIP-1967 (Logic/Beacon), EIP-1822 (UUPS), and EIP-1167 (Minimal Proxies) memory slots, querying the underlying implementation.
3. **Bytecode Analysis**: If a contract is unverified, it decompiles the raw EVM bytecode to extract `PUSH4` function selectors and builds an `abi_partial.json`.
4. **Resiliency**: Built-in HTTP retry mechanisms and RPC fallback logic.

## Supported Networks
- `ethereum`
- `bsc`
- `polygon`
- `arbitrum`
- `avalanche`

## Installation
```bash
git clone ...
cd evm-abi-recovery
npm install
```

## Configuration
Before running, copy `.env.example` to `.env` and add your optional Block Explorer API keys:
```bash
cp .env.example .env
```
Provide API keys corresponding to the chains you want to scan to avoid Rate Limits.

## Example Usage
To scan a Binance Smart Chain contract (for example, the Dexsport Proxy contract):
```bash
node index.js 0x393c06fb9134a6df6158c5f5904d962086e33814 --network bsc
```

### Outputs
- `abi.json`: The complete Array representing the Smart Contract.
- `proxy_info.json`: Generated dynamically to log the implementation details if the target address was recognized as a Transparent Upgradeable Proxy or UUPS. 
- `abi_partial.json`: Reconstructed from the Bytecode selectors if the contract remains totally unverified across all platforms.
- `logs/app.log`: Complete execution traces and HTTP connection responses.
