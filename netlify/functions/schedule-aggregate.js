// netlify/functions/schedule-aggregate.js
const { schedule } = require('@netlify/functions');
const { aggregateAndCacheRssFeeds } = require('./index.js'); // Import the function from your main backend file
// Removed: const path = require('path'); and const fs = require('fs'); as they are no longer used for disk ops

// Directly export the scheduled function handler
module.exports.handler = schedule('0 * * * *', async (event, context) => { // '0 * * * *' = every hour
  console.log('Scheduled aggregation triggered by Netlify.');

  try {
    // REMOVED: All fs.mkdirSync calls for DATA_CACHE_DIR and IMAGE_CACHE_DIR
    // As per the latest index.js, these operations are only for local development.

    await aggregateAndCacheRssFeeds(); // Run the aggregation
    console.log('Scheduled aggregation completed successfully.');
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