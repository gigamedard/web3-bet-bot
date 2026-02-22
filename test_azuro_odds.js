const axios = require('axios');

async function testAzuroConditions() {
    console.log("--- Testing Azuro V3 Conditions ---");
    try {
        const query = `{
          conditions(first: 2) {
            id
            status
            game {
              sport { name }
              participants { name }
            }
            outcomes {
              id
              currentOdds
            }
          }
        }`;
        const res = await axios.post('https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3', { query }, { timeout: 10000 });
        console.log("Success! Data:", JSON.stringify(res.data, null, 2).substring(0, 1000));
    } catch (e) {
        console.error("Azuro Error:", e.response ? e.response.status + " " + JSON.stringify(e.response.data) : e.message);
    }
}
testAzuroConditions();
