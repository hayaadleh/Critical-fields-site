// netlify/functions/schedule-aggregate.js
const { schedule } = require('@netlify/functions'); // Import the schedule helper
const { aggregateAndCacheRssFeeds } = require('./index.js'); // Import the function from your main backend file

// Directly export the scheduled function handler
// Netlify expects the `schedule` helper to be directly invoked and its result exported.
module.exports.handler = schedule('0 * * * *', async (event, context) => { // '0 * * * *' = every hour
  console.log('Scheduled aggregation triggered by Netlify.');

  try {
    // Ensure data and public/images directories exist before aggregation
    // This part of directory creation should ideally be handled within aggregateAndCacheRssFeeds
    // or as a pre-build step for robustness in serverless context, but for safety:
    const path = require('path');
    const fs = require('fs');
    const IMAGE_CACHE_DIR = path.join(__dirname, '..', 'public', 'images'); // Path relative to function file
    const DATA_CACHE_DIR = path.join(__dirname, '..', 'data'); // Path relative to function file

    if (!fs.existsSync(DATA_CACHE_DIR)) {
        fs.mkdirSync(DATA_CACHE_DIR);
    }
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
        fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    }

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