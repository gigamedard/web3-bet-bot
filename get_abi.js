const axios = require('axios');
const fs = require('fs');

async function getABI() {
    try {
        const res = await axios.get('https://api.bscscan.com/api?module=contract&action=getabi&address=0x393c06fb9134a6df6158c5f5904d962086e33814');
        fs.writeFileSync('dex_abi.json', res.data.result);
        console.log("ABI written");
    } catch (e) { console.error(e.message); }
}
getABI();
