require('dotenv').config();
const OvertimeFetcher = require('./src/fetchers/OvertimeFetcher');

async function testAuth() {
    const fetcher = new OvertimeFetcher();
    const data = await fetcher.fetchActiveEvents();
    console.log(`Found ${data.length} authenticated markets!`);
    console.log(data.slice(0, 1)); // Print first mapped market
}

testAuth();
