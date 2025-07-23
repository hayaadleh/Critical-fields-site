// netlify/functions/schedule-aggregate.js
const { schedule } = require('@netlify/functions');
const { aggregateAndCacheRssFeeds } = require('./index.js'); // Import the main aggregation function

// Directly export the scheduled function handler
module.exports.handler = schedule('0 * * * *', async (event, context) => { // '0 * * * *' = every hour
  console.log('Scheduled aggregation triggered by Netlify.');

  try {
    // This will now call the updated aggregateAndCacheRssFeeds which performs parallel fetching of ALL feeds
    await aggregateAndCacheRssFeeds(); 
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