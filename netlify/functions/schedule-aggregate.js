// netlify/functions/schedule-aggregate.js
const { schedule } = require('@netlify/functions');
const { aggregateAndCacheRssFeeds } = require('./index.js'); // Import the function from your main backend file

const handler = schedule('0 * * * *', async () => { // Runs every hour at minute 0
  console.log('Scheduled aggregation triggered by Netlify.');
  await aggregateAndCacheRssFeeds(); // Run the aggregation
  return {
    statusCode: 200,
    body: 'Aggregation complete!'
  };
});

module.exports.handler = handler;