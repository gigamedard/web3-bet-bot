const https = require('https');

async function testCloudflareBypass() {
    console.log("Testing Thales API Cloudflare Bypass...");

    // We try to make it look exactly like a Chrome browser visit
    const url = "https://api.thalesmarket.io/overtime/networks/42161/markets";
    const headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "Referer": "https://overtimemarkets.xyz/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    };

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        console.log("Status Code:", response.status);
        if (response.status === 200) {
            const data = await response.json();
            console.log(`SUCCESS! Pulled ${data.length} markets. First match: ${data[0].homeTeam} vs ${data[0].awayTeam}`);
        } else {
            const text = await response.text();
            console.log("Failed. Cloudflare Response:", text.substring(0, 200));
        }
    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

testCloudflareBypass();
