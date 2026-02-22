const axios = require('axios');

async function testAzuro() {
    console.log("--- Testing Azuro V3 ---");
    try {
        const query = `{
            games(first: 5, where: { status: Created }) {
                id
                sport { name }
                participants { name }
                startsAt
            }
        }`;
        const res = await axios.post('https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3', { query }, { timeout: 10000 });
        console.log("Success! Data:", JSON.stringify(res.data, null, 2).substring(0, 300));
    } catch (e) {
        console.error("Azuro Error:", e.response ? e.response.status + " " + JSON.stringify(e.response.data) : e.message);
    }
}

async function testDexsport() {
    console.log("\n--- Testing Dexsport ---");
    try {
        const query = `{
            markets(first: 5) { id }
        }`;
        const res = await axios.post('https://api.thegraph.com/subgraphs/name/dexsport-official/dexsport-subgraph-bsc', { query }, { timeout: 10000 });
        console.log("Success! Data:", JSON.stringify(res.data, null, 2).substring(0, 300));
    } catch (e) {
        console.error("Dexsport Error:", e.response ? e.response.status + " " + JSON.stringify(e.response.data) : e.message);
    }
}

async function run() {
    await testAzuro();
    await testDexsport();
    process.exit(0);
}

run();
