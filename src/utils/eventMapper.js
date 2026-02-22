const Fuse = require('fuse.js');

/**
 * Reconciles events from Azuro and Dexsport.
 * Uses Fuse.js for fuzzy name matching and enforces a 15-minute start time tolerance.
 * 
 * Expected shape of an event object:
 * {
 *   id: string,
 *   name: string,       // e.g. "Real Madrid vs FC Barcelona"
 *   startTime: number,  // Unix timestamp (seconds)
 *   odds: number[],     // [Home, Draw, Away] or similar
 *   ...
 * }
 * 
 * @param {Array} azuroEvents - Array of events from Azuro (Polygon)
 * @param {Array} dexsportEvents - Array of events from Dexsport (BSC)
 * @returns {Array} Array of matched event pairs
 */
function matchEvents(azuroEvents, dexsportEvents) {
    const matchedPairs = [];
    const MAX_TIME_DIFF_SECONDS = 15 * 60; // 15 minutes tolerance

    // Initialize Fuse with Dexsport events
    // Assuming 'name' is the field to perform fuzzy matching on
    const fuse = new Fuse(dexsportEvents, {
        keys: ['name'],
        includeScore: true,
        threshold: 0.6, // Increased threshold for broader matching ("PSG" vs "Paris SG")
    });

    for (const azuroEvent of azuroEvents) {
        // Find matching events based on name similarity
        const results = fuse.search(azuroEvent.name);

        for (const result of results) {
            const dexsportEvent = result.item;

            // Enforce temporal check
            const timeDiff = Math.abs(azuroEvent.startTime - dexsportEvent.startTime);

            if (timeDiff <= MAX_TIME_DIFF_SECONDS) {
                // We have a match!
                matchedPairs.push({
                    azuroEvent,
                    dexsportEvent,
                    score: result.score
                });

                // Optional: Once a match is found for the given azuro event, 
                // you might want to `break;` to prevent duplicate mappings
                break;
            }
        }
    }

    return matchedPairs;
}

module.exports = {
    matchEvents
};
