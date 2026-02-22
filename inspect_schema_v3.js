const { request, gql } = require('graphql-request');
require('dotenv').config();

const url = 'https://gateway.thegraph.com/api/' + process.env.THEGRAPH_API_KEY + '/subgraphs/id/DFNKpS95y26V3kuTa9MtD2J3ws65QF6RPP7RFLRjaHFx';

async function introspect() {
    console.log("Introspecting V1/V2 Overtime Subgraph: ", url);
    const query = gql`{
      __schema {
        types {
          name
          fields {
            name
            type { name kind }
          }
        }
      }
    }`;

    try {
        const typeData = await request(url, query);

        let foundTeams = false;
        let sportMarketFields = [];

        typeData.__schema.types.forEach(t => {
            if (!t.fields) return;

            if (t.name === 'SportMarket' || t.name === 'Market') {
                sportMarketFields = t.fields.map(f => f.name);
            }

            const hasTeam = t.fields.find(f => f.name.toLowerCase().includes('team'));
            if (hasTeam) {
                console.log(`\nFound team-related fields in table: [${t.name}]`);
                t.fields.forEach(f => {
                    if (f.name.toLowerCase().includes('team')) {
                        console.log(`   - ${f.name}`);
                    }
                });
                foundTeams = true;
            }
        });

        console.log("\nFields in SportMarket/Market:", sportMarketFields.join(", "));

        if (!foundTeams) {
            console.log("\nWARNING: No table containing 'team' fields was found in this Subgraph.");
        }

    } catch (e) {
        console.error("Introspection Error:", e);
    }
}

introspect().then(() => process.exit(0));
