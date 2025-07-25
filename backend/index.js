require('dotenv').config();

const express = require('express');
const path = require('path');
// const fs = require('fs'); // <--- REMOVE: No longer writing to local FS for cache
const RSSParser = require('rss-parser');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIG ---
const GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdn5xz0N63Dzl0n7PRGNTBLk5RkcddzJQ4MoObZJFNeE-9qUbYkdO49bgGlwUyJnby0innAVYaVR7n/pub?outp';

// Removed CACHE_FILE_PATH and IMAGE_CACHE_DIR constants
// Removed CACHE_UPDATE_SCHEDULE constant (it's already used in cron.schedule)

// --- CORS ---
const allowedOrigins = [
  'http://localhost:8000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://criticalfields.com'
];

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// REMOVED: app.use('/images', express.static(IMAGE_CACHE_DIR));
// Images will now be proxied dynamically, not served statically from local cache

// --- CSV Parsing (No changes needed here) ---
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (!lines.length) return [];

  const parseLine = (line) => {
    const values = [];
    let inQuote = false, currentVal = '';
    for (let char of line) {
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());
    return values;
  };

  const headers = parseLine(lines[0]).map(header =>
    header.trim().replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s(.)/g, (_, p1) => p1.toUpperCase()).replace(/\s/g, '')
  );

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length !== headers.length) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    obj.FieldNormalized = obj.Field
      ? obj.Field.toLowerCase().split(',').map(f => f.trim().replace(/\s/g, '-'))
      : [];
    data.push(obj);
  }

  return data;
}

// --- Image Extraction (No changes needed here) ---
function extractImageFromRssItem(item) {
  const fields = [
    item?.enclosure?.url,
    item?.itunes?.image,
    item?.media?.thumbnail?.url,
    item?.media?.content?.url,
    item?.image?.url,
    item?.thumbnail,
    item?.['og:image']
  ];
  for (let url of fields) {
    if (url && url.startsWith('http')) return url;
  }
  const html = item.content || item.contentSnippet || item.description || '';
  const match = html.match(/<img[^>]+src="([^">]+)"/i);
  if (match?.[1]) {
    let imgSrc = match[1];
    if (imgSrc.startsWith('//')) imgSrc = `https:${imgSrc}`;
    return imgSrc.startsWith('http') ? imgSrc : null;
  }
  return null;
}

// --- Aggregation Logic ---
let cachedRssData = []; // This will now hold the data purely in memory

async function aggregateAndCacheRssFeeds() {
  console.log('🔁 Aggregating RSS...');
  const rssParser = new RSSParser({ headers: { 'User-Agent': 'Mozilla/5.0' } });
  const allArticles = [];

  try {
    const { data: sheetData } = await axios.get(GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL);
    const archiveData = parseCSV(sheetData);
    const feeds = [...new Set(archiveData.filter(d => d.RSSFeed).map(d => d.RSSFeed))];

    const results = await Promise.allSettled(feeds.map(async url => {
      try {
        const feed = await rssParser.parseURL(url);
        const origin = archiveData.find(d => d.RSSFeed === url);
        const articles = feed.items.map(item => ({
          title: item.title || 'Untitled',
          link: item.link,
          description: (item.contentSnippet || item.summary || item.description || '')
            .replace(/<[^>]*>?/gm, '').substring(0, 300) + '...',
          pubDate: item.pubDate,
          creator: item.creator || item.author,
          feedTitle: feed.title,
          originalImageUrl: extractImageFromRssItem(item),
          // imageUrl will now be dynamically generated for proxying
          imageUrl: null, // Will be set to our proxy URL
          field: origin?.Field || 'Unknown',
          fieldNormalized: origin?.FieldNormalized || ['unknown']
        }));
        return articles;
      } catch (e) {
        console.warn(`❌ Failed: ${url}`);
        return [];
      }
    }));

    const flatArticles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    flatArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // --- Image Proxying Adjustment ---
    // Instead of downloading and saving, we'll make the imageUrl point to our own proxy endpoint
    for (const article of flatArticles) {
      if (article.originalImageUrl) {
        // Encode the original image URL so it can be safely passed as a query parameter
        article.imageUrl = `/proxy-image?url=${encodeURIComponent(article.originalImageUrl)}`;
      }
    }

    cachedRssData = flatArticles; // Update in-memory cache
    // REMOVED: fs.writeFileSync(CACHE_FILE_PATH, ...);
    console.log(`✅ Aggregated ${cachedRssData.length} articles into memory cache`);

  } catch (err) {
    console.error('Fatal aggregation error:', err.message);
    // REMOVED: Fallback to reading from old cache file
    // If aggregation fails, cachedRssData will remain what it was before, or empty if first run.
  }
}

// --- API Endpoint ---
app.get('/api/field-rss', async (req, res) => {
  const { field } = req.query;

  // If cache is empty, attempt to aggregate. This handles the very first request
  // or a server restart scenario. The cron job handles regular updates.
  if (!cachedRssData.length) {
    console.log('Cache empty, attempting immediate aggregation...');
    await aggregateAndCacheRssFeeds();
  }

  const results = field
    ? cachedRssData.filter(a => a.fieldNormalized.includes(field.toLowerCase()))
    : cachedRssData;

  res.json(results);
});

// --- NEW: Image Proxy Endpoint ---
app.get('/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Image URL is required.');
  }

  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'];

    // Basic content-type validation to ensure it's an image
    if (!contentType || !contentType.startsWith('image')) {
      return res.status(400).send('Provided URL is not an image.');
    }

    // Set appropriate headers for image and send the buffer
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours on client/CDN
    res.send(response.data);

  } catch (error) {
    console.error(`Error proxying image ${imageUrl}:`, error.message);
    res.status(500).send('Failed to proxy image.');
  }
});


// --- Start Server ---
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // REMOVED: fs.mkdirSync calls - no longer needed for local cache directories.

  // Initial aggregation on server start
  await aggregateAndCacheRssFeeds();

  // Schedule cron job for hourly updates
  cron.schedule('0 * * * *', () => aggregateAndCacheRssFeeds());
});