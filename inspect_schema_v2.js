const { request, gql } = require('graphql-request');
require('dotenv').config();

const url = 'https://gateway.thegraph.com/api/subgraphs/id/BRtus5QB7fZzKBAtMEm4KyhJyGCKWPoGGiMiQzqdFmfv';
const key = process.env.THEGRAPH_API_KEY;

async function introspect() {
    console.log("Introspecting V2 Sports Subgraph: ", url);
    const query = gql`{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`;

    try {
        const data = await request(url, query, {}, { Authorization: `Bearer ${key}` });
        const fields = data.__schema.queryType.fields.map(f => f.name);
        console.log("Available Query Fields:", fields.join(', '));

        // Let's also check 'SportMarket' or 'Game' if they exist in the schema
        const queryTypes = gql`{
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
        const typeData = await request(url, queryTypes, {}, { Authorization: `Bearer ${key}` });

        let foundTeams = false;
        typeData.__schema.types.forEach(t => {
            if (!t.fields) return;
            const hasTeam = t.fields.find(f => f.name.toLowerCase().includes('team'));
            if (hasTeam) {
                console.log(`\nFound team-related fields in table: [${t.name}]`);
                t.fields.forEach(f => console.log(`   - ${f.name}`));
                foundTeams = true;
            }
        });

        if (!foundTeams) {
            console.log("\nWARNING: No table containing 'team' fields was found in this Subgraph.");
        }

    } catch (e) {
        console.error("Introspection Error:", e);
    }
}

introspect().then(() => process.exit(0));
