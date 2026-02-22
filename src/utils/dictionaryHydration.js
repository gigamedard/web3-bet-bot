/**
 * Dictionary Hydration Module
 * 
 * This module solves the problem of missing text data on-chain (like Dexsport's bytes32 IDs)
 * by using an Oracle/Subgraph source (like Azuro) that contains the full text data.
 * It matches events across platforms using Intelligent Fuzzy Matching grouped by Sport.
 * 
 * Uses a built-in Dice's Coefficient algorithm instead of external dependencies.
 */

const { logger } = require('../engine/ArbitrageEngine');

/**
 * Pure JS implementation of Dice's Coefficient for string similarity.
 * Returns a score between 0.0 (no match) and 1.0 (perfect match).
 */
function diceCoefficient(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    if (s1.length < 2 || s2.length < 2) return 0;

    const bigrams1 = new Map();
    for (let i = 0; i < s1.length - 1; i++) {
        const bigram = s1.substring(i, i + 2);
        bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < s2.length - 1; i++) {
        const bigram = s2.substring(i, i + 2);
        const count = bigrams1.get(bigram) || 0;
        if (count > 0) {
            bigrams1.set(bigram, count - 1);
            intersection++;
        }
    }

    return (2.0 * intersection) / ((s1.length - 1) + (s2.length - 1));
}

/**
 * Find the best match for `mainString` among an array of `targetStrings`.
 * Returns { bestMatch: { target, rating }, bestMatchIndex }.
 */
function findBestMatch(mainString, targetStrings) {
    let bestRating = 0;
    let bestIndex = 0;
    let bestTarget = '';

    for (let i = 0; i < targetStrings.length; i++) {
        const rating = diceCoefficient(mainString, targetStrings[i]);
        if (rating > bestRating) {
            bestRating = rating;
            bestIndex = i;
            bestTarget = targetStrings[i];
        }
    }

    return {
        bestMatch: { target: bestTarget, rating: bestRating },
        bestMatchIndex: bestIndex
    };
}

function hydrateDictionaryByCompositeKey(azuroEvents, targetEvents) {
    logger.debug("Hydrating On-Chain markets with Azuro names via Sport-First Fuzzy Matching...");
    const matchedPairs = [];

    // PHASE 1: Group Target Events (Overtime) by Sport to reduce scope
    const targetBySport = {};
    for (const targetEvent of targetEvents) {
        const sport = (targetEvent.sport || "unknown").toLowerCase();
        if (!targetBySport[sport]) {
            targetBySport[sport] = [];
        }
        targetBySport[sport].push(targetEvent);
    }

    const sportBuckets = Object.keys(targetBySport);
    logger.debug(`[Hydration] Phase 1 Complete. Overtime Sport Buckets: [${sportBuckets.join(', ')}]`);

    let hydratedCount = 0;
    const cleanStr = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    // PHASE 2: Iterate through Azuro Events and Fuzzy Match within the same Sport Bucket
    for (const azuroEvent of azuroEvents) {
        const sport = (azuroEvent.sport || "unknown").toLowerCase();
        const matchingTargetEvents = targetBySport[sport];

        if (!matchingTargetEvents || matchingTargetEvents.length === 0) continue;

        const azuroCleanName = cleanStr(azuroEvent.name);
        if (!azuroCleanName || azuroCleanName.length < 2) continue;

        const targetNamesMap = matchingTargetEvents.map(t => cleanStr(t.name)).filter(n => n.length > 1);
        if (targetNamesMap.length === 0) continue;

        try {
            const result = findBestMatch(azuroCleanName, targetNamesMap);
            const bestMatch = result.bestMatch;

            if (bestMatch.rating > 0.45) {
                const winningTargetEvent = matchingTargetEvents[result.bestMatchIndex];
                const timeDiffHours = Math.abs(azuroEvent.startTime - winningTargetEvent.startTime) / 3600;

                if (timeDiffHours <= 36) {
                    logger.info(`[Hydration] [${sport}] ✅ Fuzzy Matched "${azuroEvent.name}" ↔ "${winningTargetEvent.name}" (Score: ${bestMatch.rating.toFixed(2)})`);

                    winningTargetEvent.name = azuroEvent.name;

                    matchedPairs.push({
                        eventA: azuroEvent,
                        eventB: winningTargetEvent,
                        confidence: bestMatch.rating
                    });
                    hydratedCount++;
                } else {
                    logger.debug(`[Hydration] [${sport}] Name match high (${bestMatch.rating.toFixed(2)}) for "${azuroEvent.name}" but time gap too large (${timeDiffHours.toFixed(1)}h).`);
                }
            }
        } catch (err) {
            logger.error(`Fuzzy Match Error on [${sport}] "${azuroCleanName}": ${err.message}`);
        }
    }

    logger.debug(`Successfully hydrated and matched ${hydratedCount} events via Fuzzy Name Search.`);
    return matchedPairs;
}

module.exports = { hydrateDictionaryByCompositeKey };
