const { ethers } = require('ethers');
require('dotenv').config();

const ERC20_ABI = [
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address account) view returns (uint256)"
];

async function transferTokens() {
    console.log("=========================================");
    console.log("💸 Token Transfer Script 💸");
    console.log("=========================================");

    const privateKey = process.env.PRIVATE_KEY;
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 3) {
        console.error("❌ Usage: node transfer_tokens.js <--bsc | --polygon> <recipient_address> <amount>");
        console.error("Example: node transfer_tokens.js --bsc 0xYourAddress 100");
        process.exit(1);
    }

    const networkArg = args[0].toLowerCase();
    const recipientAddress = args[1];
    const amountToTransfer = args[2];

    let rpcUrl, defaultToken;
    if (networkArg === '--bsc') {
        rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";
        defaultToken = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
    } else if (networkArg === '--polygon') {
        rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
        defaultToken = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // Polygon USDT
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
        const parsedAmount = ethers.parseUnits(amountToTransfer.toString(), decimals);

        console.log(`\nSender: ${wallet.address}`);
        console.log(`Network: ${networkArg === '--bsc' ? 'BSC' : 'Polygon'}`);

        const balance = await tokenContract.balanceOf(wallet.address);
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log(`Current Balance: ${formattedBalance} ${symbol}`);

        if (balance < parsedAmount) {
            console.error(`❌ Insufficient balance! You have ${formattedBalance} but tried to send ${amountToTransfer}`);
            process.exit(1);
        }

        console.log(`\n⏳ Transferring ${amountToTransfer} ${symbol} to ${recipientAddress}...`);
        const tx = await tokenContract.transfer(recipientAddress, parsedAmount);

        console.log(`Transaction sent! Waiting for confirmation...`);
        const receipt = await tx.wait();

        console.log(`✅ Transfer successful! Block: ${receipt.blockNumber}, TX: ${tx.hash}`);

    } catch (error) {
        console.error("❌ Error during transfer:", error.message);
    }
}

transferTokens();
