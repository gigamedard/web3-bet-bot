const { ethers } = require('ethers');
require('dotenv').config();

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

async function approveTokens() {
    console.log("=========================================");
    console.log("💰 Token Allowance Script 💰");
    console.log("=========================================");
    const privateKey = process.env.PRIVATE_KEY;

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error("❌ Usage: node approve_tokens.js <--bsc | --polygon>");
        console.error("Example: node approve_tokens.js --bsc");
        process.exit(1);
    }

    const networkArg = args[0].toLowerCase();

    let rpcUrl, defaultToken, targetSpender;
    if (networkArg === '--bsc') {
        rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";
        defaultToken = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
        targetSpender = process.env.DEXSPORT_POOL_CONTRACT || "0x393c06fb9134a6df6158c5f5904d962086e33814";
    } else if (networkArg === '--polygon') {
        rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
        defaultToken = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // Polygon USDT
        targetSpender = process.env.AZURO_LP_CONTRACT || "0x204e7371Ade792c5C006fb52711c50a7efC843ed";
    } else {
        console.error("❌ Invalid network argument. Use --bsc or --polygon");
        process.exit(1);
    }

    const tokenAddress = process.env.TOKEN_ADDRESS || defaultToken;

    if (!privateKey || !rpcUrl) {
        console.error("❌ Missing PRIVATE_KEY or RPC URL in .env file");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    try {
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();
        const amountToApprove = ethers.parseUnits("1000000", decimals); // Approve 1M tokens

        console.log(`\nWallet: ${wallet.address}`);
        console.log(`Approving ${symbol} (${tokenAddress}) on ${networkArg === '--bsc' ? 'BSC' : 'Polygon'}`);

        console.log(`\nChecking allowance for Spender Contract (${targetSpender})...`);
        const currentAllowance = await tokenContract.allowance(wallet.address, targetSpender);

        if (currentAllowance >= amountToApprove / 2n) {
            console.log(`✅ Spender already has sufficient allowance.`);
        } else {
            console.log(`⏳ Sending approval transaction...`);
            const tx = await tokenContract.approve(targetSpender, amountToApprove);
            await tx.wait();
            console.log(`✅ Approved successfully! TX: ${tx.hash}`);
        }

    } catch (error) {
        console.error("❌ Error during approval:", error.message);
    }
}

approveTokens();
