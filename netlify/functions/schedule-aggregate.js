// netlify/functions/schedule-aggregate.js
const { schedule } = require('@netlify/functions');
// REMOVED: const path = require('path'); and const fs = require('fs'); -- No longer needed for disk ops
const { aggregateAndCacheRssFeeds } = require('./index.js'); // Import the main aggregation function

// Directly export the scheduled function handler
module.exports.handler = schedule('0 * * * *', async (event, context) => { // '0 * * * *' = every hour (UTC)
  console.log('Scheduled aggregation triggered by Netlify.');

  try {
    // REMOVED: All fs.mkdirSync calls for DATA_CACHE_DIR and IMAGE_CACHE_DIR
    // REMOVED: All fs.writeFileSync calls.
    // The aggregateAndCacheRssFeeds function will now run without persisting anything to disk here.
    
    await aggregateAndCacheRssFeeds(); // Run the aggregation

    // At this point, the cachedRssData in memory for this particular function invocation is populated.
    // This function's primary purpose on Netlify is now to confirm that the aggregation process
    // can complete and to log its status. It does NOT persist the cache for other function invocations.
    // The 'index' function will still perform its own aggregation on cold start.

    console.log('Scheduled aggregation completed successfully (no disk write).');
    return {
      statusCode: 200,
      body: 'Aggregation complete!'
    };
  } catch (error) {
    console.error('Scheduled aggregation failed:', error);
    return {
      statusCode: 500,
      body: `Aggregation failed: ${error.message}`
    };
  }
});