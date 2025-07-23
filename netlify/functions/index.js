// Load environment variables from .env file (ensure you have a .env file if using secrets)
require('dotenv').config();

// --- Module Imports ---
const express = require('express');
const path = require('path'); // Still needed for path.basename in image extraction
const fs = require('fs'); // Still needed for existsSync in local dev checks (but won't be used in production)
const RSSParser = require('rss-parser');
const cron = require('node-cron'); // Used for scheduling, even if Netlify uses its own scheduler for production
const axios = require('axios');
const serverless = require('serverless-http'); // Used for Netlify function export

// --- Configuration ---
const GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdn5xz0N63Dzl0n7PRGNTBLk5RkcddzJQ4MoObZJFNeE-9qUbYkdO49bgGlwUyJnby0innAVYaVR7n/pub?output=csv';

// Paths for local development ONLY (These folders are not used in Netlify production)
const CACHE_FILE_PATH = path.join(__dirname, 'data', 'cached_rss_data.json');
const IMAGE_CACHE_DIR = path.join(__dirname, 'public', 'images');

// Cron schedule (used for local development's internal scheduler)
const CACHE_UPDATE_SCHEDULE = '0 * * * *';

// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3000; // Local port, not used by Netlify Functions directly

// Enable CORS for your frontend domain
const allowedOrigins = [
    'http://localhost:8000',
    'http://127.0.0.1:5500', // Your Live Server address
    'http://localhost:5500', // Another common Live Server address
    'https://criticalfields.com', // Your actual deployed site domain
    'https://dulcet-monstera-0c4f54.netlify.app' // Crucial: Your Netlify live domain
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

// For local development: serve static images. This block is skipped by Netlify Functions.
if (process.env.NODE_ENV !== 'production') {
    app.use('/images', express.static(IMAGE_CACHE_DIR));
}


// --- Helper Function: Parse CSV Data ---
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length === 0) return [];

    const parseLine = (line) => {
        const values = [];
        let inQuote = false;
        let currentVal = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
                if (!inQuote && i < line.length - 1 && line[i+1] === '"') {
                    currentVal += '"';
                    i++;
                }
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

    const headers = parseLine(lines[0]).map(header => {
        return header.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s(.)/g, (match, p1) => p1.toUpperCase()).replace(/\s/g, '');
    });
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        if (values.length !== headers.length) {
            console.warn(`Skipping malformed row (header/value count mismatch): ${lines[i]}`);
            continue;
        }
        const rowObject = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index] ? values[index] : '';
        });

        if (rowObject.Field) {
            rowObject.FieldNormalized = rowObject.Field.toLowerCase().split(',').map(f => f.trim().replace(/\s/g, '-')).filter(Boolean);
        } else {
            rowObject.FieldNormalized = [];
        }
        data.push(rowObject);
    }
    return data;
}


// --- Helper Function: Extract Image from RSS Item (Returns original URL) ---
// For Netlify, images will be loaded directly from originalImageUrl, so CORS/hotlinking issues might return.
function extractImageFromRssItem(item) {
    if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) return item.enclosure.url;
    if (item.itunes && item.itunes.image) return item.itunes.image;
    if (item.media && item.media.thumbnail && item.media.thumbnail.url) return item.media.thumbnail.url;
    if (item.media && item.media.content && item.media.content.url && item.media.content.type && item.media.content.type.startsWith('image')) return item.media.content.url;
    if (item.media && Array.isArray(item.media.content)) {
        const mediaContent = item.media.content.find(content => content.url && content.type && content.type.startsWith('image/'));
        if (mediaContent) return mediaContent.url;
    }
    if (item.image && typeof item.image === 'object' && item.image.url) return item.image.url;
    if (item.thumbnail) return item.thumbnail;
    if (item['og:image']) return item['og:image']; 

    const htmlToParse = item.content || item.contentSnippet || item.description || '';
    if (htmlToParse) {
        const imgMatch = htmlToParse.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch && imgMatch[1]) {
            let imgSrc = imgMatch[1];
            if (imgSrc.startsWith('//')) { imgSrc = `https:${imgSrc}`; } 
            else if (imgSrc.startsWith('/')) { 
                try {
                    const feedUrl = new URL(item.link || item.feedUrl);
                    imgSrc = `${feedUrl.protocol}//${feedUrl.hostname}${imgSrc}`;
                } catch (e) { /* silent fail */ }
            }
            if (imgSrc.startsWith('http')) return imgSrc;
        }
    }
    return null;
}

// --- Core Function: Fetch, Aggregate, and Cache RSS Feeds (Modified for Serverless) ---
// Cache is IN-MEMORY only for Netlify Functions, it won't persist across invocations.
// For local development, it still writes to disk.
let cachedRssData = []; 

async function aggregateAndCacheRssFeeds() {
    console.log('Starting RSS aggregation and caching process...');
    const rssParser = new RSSParser({
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    let allAggregatedArticles = [];

    try {
        const sheetResponse = await axios.get(GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL);
        const archiveData = parseCSV(sheetResponse.data);

        const rssSources = archiveData.filter(item => item.RSSFeed && item.RSSFeed.startsWith('http'));
        const uniqueRssUrls = new Set();
        for (const source of rssSources) { uniqueRssUrls.add(source.RSSFeed); }

        // NEW: Parallel Fetching of RSS Feeds
        const fetchPromises = Array.from(uniqueRssUrls).map(async (rssUrl) => {
            try {
                console.log(`  Fetching RSS from: ${rssUrl}`);
                const feed = await rssParser.parseURL(rssUrl);

                if (feed && feed.items) {
                    const articlesFromFeed = [];
                    feed.items.forEach(item => {
                        const originalSource = archiveData.find(d => d.RSSFeed === rssUrl);
                        articlesFromFeed.push({
                            title: item.title || 'Untitled',
                            link: item.link,
                            description: item.contentSnippet || item.summary || item.description ? (item.contentSnippet || item.summary || item.description).replace(/<[^>]*>?/gm, '').substring(0, 300) + '...' : 'No description available.',
                            pubDate: item.pubDate,
                            creator: item.creator || item.author,
                            feedTitle: feed.title,
                            originalImageUrl: extractImageFromRssItem(item),
                            imageUrl: extractImageFromRssItem(item), // For Netlify, imageUrl will be the original URL
                            field: originalSource ? originalSource.Field : 'Unknown',
                            fieldNormalized: originalSource ? originalSource.FieldNormalized : ['unknown']
                        });
                    });
                    return { success: true, articles: articlesFromFeed };
                }
                return { success: false, message: `No items in feed ${rssUrl}` };
            } catch (rssError) {
                console.error(`Error fetching or parsing RSS feed ${rssUrl}:`, rssError.message);
                return { success: false, message: `Error for ${rssUrl}: ${rssError.message}` };
            }
        });

        const results = await Promise.allSettled(fetchPromises);
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.success) {
                allAggregatedArticles.push(...result.value.articles);
            } else if (result.status === 'fulfilled' && !result.value.success) {
                console.warn(`Skipped feed due to no items or error: ${result.value.message}`);
            } else if (result.status === 'rejected') {
                console.error(`Promise rejected for a feed fetch:`, result.reason);
            }
        });

        allAggregatedArticles.sort((a, b) => {
            const dateA = Date.parse(a.pubDate);
            const dateB = Date.parse(b.pubDate);
            if (isNaN(dateA) && isNaN(dateB)) return 0;
            if (isNaN(dateA)) return 1; 
            if (isNaN(dateB)) return -1; 
            return dateB - dateA;
        });

        // Image download and caching logic for LOCAL DEVELOPMENT ONLY
        if (process.env.NODE_ENV !== 'production') {
            console.log('Starting image download and caching (local only)...');
            const processedArticles = [];
            if (!fs.existsSync(IMAGE_CACHE_DIR)) {
                fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
            }

            for (const article of allAggregatedArticles) {
                if (article.originalImageUrl && article.originalImageUrl.startsWith('http')) {
                    try {
                        const filenameBase = path.basename(article.link || 'no-link').replace(/[^a-zA-Z0-9.-]/g, '_');
                        const filename = `${filenameBase.substring(0, 50)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;
                        const imagePath = path.join(IMAGE_CACHE_DIR, filename);
                        const imageUrlOnBackend = `http://localhost:${PORT}/images/${filename}`;

                        const imageResponse = await axios.get(article.originalImageUrl, { responseType: 'arraybuffer' });
                        
                        if (imageResponse.headers['content-type'] && imageResponse.headers['content-type'].startsWith('image')) {
                            fs.writeFileSync(imagePath, imageResponse.data);
                            article.imageUrl = imageUrlOnBackend;
                        } else {
                            console.warn(`  Skipping non-image content (type: ${imageResponse.headers['content-type'] || 'unknown'}) from ${article.originalImageUrl.substring(0, 100)}...`);
                            article.imageUrl = null;
                        }
                    } catch (imageDownloadError) {
                        console.error(`  Error downloading image for ${article.originalImageUrl}:`, imageDownloadError.message.substring(0, 100));
                        article.imageUrl = null;
                    }
                } else {
                    article.imageUrl = null;
                }
                processedArticles.push(article);
            }
            allAggregatedArticles = processedArticles;
            console.log('Image download and caching complete (local only).');

            fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(allAggregatedArticles, null, 2), 'utf8');
        }
        
        cachedRssData = allAggregatedArticles;
        console.log(`RSS data successfully aggregated and cached (in memory). Total articles: ${allAggregatedArticles.length}`);

    } catch (error) {
        console.error('Fatal error during RSS aggregation:', error.message);
        if (process.env.NODE_ENV !== 'production' && fs.existsSync(CACHE_FILE_PATH)) {
            try {
                cachedRssData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
                console.log('Loaded previous local cache due to new aggregation error.');
            } catch (loadError) {
                console.error('Failed to load previous local cache:', loadError.message);
            }
        }
    }
}

// --- API Endpoint ---
app.get('/api/field-rss', async (req, res) => {
    const fieldParam = req.query.field;

    // In production, cachedRssData might be empty on cold start. Aggregate if needed.
    if (cachedRssData.length === 0) {
        if (process.env.NODE_ENV === 'production') {
            console.log('API cold start: Aggregating RSS data for first request.');
            await aggregateAndCacheRssFeeds();
        } else { // Local development: try to read from local file, or aggregate if file missing
            if (!fs.existsSync(CACHE_FILE_PATH)) {
                console.warn('Cache file not found locally. Aggregating on demand locally.');
                await aggregateAndCacheRssFeeds();
            } else {
                try {
                    cachedRssData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
                } catch (readError) {
                    console.error('Error reading local cache file:', readError);
                    return res.status(500).json({ message: 'Error reading local cache file.' });
                }
            }
        }
    }

    try {
        let filteredData = cachedRssData; // Use in-memory cache
        if (fieldParam) {
            const normalizedFieldParam = fieldParam.toLowerCase();
            filteredData = cachedRssData.filter(item => 
                item.fieldNormalized && item.fieldNormalized.includes(normalizedFieldParam)
            );
        }
        res.json(filteredData);

    } catch (error) {
        console.error('Error serving RSS data:', error.message);
        res.status(500).json({ message: 'Error retrieving RSS data.' });
    }
});

// --- Start Server & Schedule Cache Updates (Local Development Only) ---
// This entire block only runs when index.js is executed directly (not as a Netlify Function)
// This block has been removed for production deployment.
// If you run 'node index.js' locally after this, it will not start a server.

// Export the Express app as a serverless function for Netlify
module.exports.handler = serverless(app);
// Also export the aggregation function for Netlify Scheduled Functions
module.exports.aggregateAndCacheRssFeeds = aggregateAndCacheRssFeeds;