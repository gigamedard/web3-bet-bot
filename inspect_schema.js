const { request, gql } = require('graphql-request');
require('dotenv').config();

const url = process.env.OVERTIME_API_URL;
const key = process.env.THEGRAPH_API_KEY;

async function introspectMarket() {
    const query = gql`{
      __type(name: "Market") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }`;

    try {
        const data = await request(url, query, {}, { Authorization: `Bearer ${key}` });
        console.log("MARKET FIELDS:");
        data.__type.fields.forEach(f => {
            console.log(` - ${f.name} (${f.type.name || f.type.kind})`);
        });

    } catch (e) {
        console.error("Introspection Error:", e);
    }
}

introspectMarket().then(() => process.exit(0));
