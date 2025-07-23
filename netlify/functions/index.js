// Load environment variables from .env file (ensure you have a .env file if using secrets)
require('dotenv').config();

// --- Module Imports ---
const express = require('express');
const path = require('path');
const fs = require('fs');
const RSSParser = require('rss-parser');
const cron = require('node-cron');
const axios = require('axios'); // Used for fetching Google Sheet CSV and downloading images
const serverless = require('serverless-http'); // NEW: Import serverless-http

// --- Configuration ---
// Your main Google Sheet URL (the one you provided earlier)
const GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdn5xz0N63Dzl0n7PRGNTBLk5RkcddzJQ4MoObZJFNeE-9qUbYkdO49bgGlwUyJnby0innAVYaVR7n/pub?output=csv';

// Path to store your cached RSS data JSON file
const CACHE_FILE_PATH = path.join(__dirname, 'data', 'cached_rss_data.json');

// NEW: Directory to store downloaded and cached images
const IMAGE_CACHE_DIR = path.join(__dirname, 'public', 'images');

// Cron schedule for updating the cache (e.g., '0 * * * *' = every hour)
const CACHE_UPDATE_SCHEDULE = '0 * * * *'; // Adjust as needed

// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3000; // CORRECTED: PORT variable is now defined here

// Enable CORS for your frontend domain (IMPORTANT!)
// Add all domains/ports where your frontend runs (local dev, live site)
const allowedOrigins = [
    'http://localhost:8000',
    'http://127.0.0.1:5500', // Your Live Server address
    'http://localhost:5500', // Another common Live Server address
    'https://criticalfields.com' // Your actual deployed site domain
    'https://dulcet-monstera-0c4f54.netlify.app'
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

// NEW: Configure Express to serve static image files from the IMAGE_CACHE_DIR
// Requests to /images/* will now serve files from your public/images folder
app.use('/images', express.static(IMAGE_CACHE_DIR));


// --- Helper Function: Parse CSV Data (from Google Sheet) ---
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
        // Normalize headers: remove non-alphanumeric, convert to camelCase
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

        // Normalize 'Field' column for filtering
        if (rowObject.Field) {
            rowObject.FieldNormalized = rowObject.Field.toLowerCase().split(',').map(f => f.trim().replace(/\s/g, '-')).filter(Boolean);
        } else {
            rowObject.FieldNormalized = [];
        }
        data.push(rowObject);
    }
    return data;
}


// --- Helper Function: Extract Image from RSS Item (Final Enhanced Version) ---
function extractImageFromRssItem(item) {
    // console.log('Attempting to extract image for:', item.title); // Debugging line

    // Priority 1: Direct media/enclosure/itunes images
    if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) return item.enclosure.url;
    if (item.itunes && item.itunes.image) return item.itunes.image;
    if (item.media && item.media.thumbnail && item.media.thumbnail.url) return item.media.thumbnail.url;
    if (item.media && item.media.content && item.media.content.url && item.media.content.type && item.media.content.type.startsWith('image')) return item.media.content.url;
    if (item.media && Array.isArray(item.media.content)) { // If media:content is an array
         const mediaContent = item.media.content.find(content => content.url && content.type && content.type.startsWith('image/'));
         if (mediaContent) return mediaContent.url;
    }

    // Priority 2: Direct image properties (less standard but sometimes present)
    if (item.image && typeof item.image === 'object' && item.image.url) return item.image.url;
    if (item.thumbnail) return item.thumbnail;
    if (item['og:image']) return item['og:image']; // For Open Graph images pulled by some parsers

    // Priority 3: Image within HTML content/description
    const htmlToParse = item.content || item.contentSnippet || item.description || '';
    if (htmlToParse) {
        const imgMatch = htmlToParse.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch && imgMatch[1]) {
            // Ensure it's a full URL if it's a relative path
            let imgSrc = imgMatch[1];
            if (imgSrc.startsWith('//')) { // Protocol-relative URL
                imgSrc = `https:${imgSrc}`; // Assume https
            } else if (imgSrc.startsWith('/')) { // Root-relative URL, need original feed domain
                try {
                    const feedUrl = new URL(item.link || item.feedUrl); // Use item.link or a specific feedUrl if available
                    imgSrc = `${feedUrl.protocol}//${feedUrl.hostname}${imgSrc}`;
                } catch (e) { /* Fallback to null */ }
                if (imgSrc.startsWith('http')) return imgSrc; // Only return if it's a full HTTP/HTTPS URL
            } else if (imgSrc.startsWith('http')) { // Already a full URL
                 return imgSrc;
            }
        }
    }

    return null; // No image found after all attempts
}

// --- Core Function: Fetch, Aggregate, and Cache RSS Feeds (Enhanced with Image Download) ---
let cachedRssData = []; // Store data in memory after initial load/update

async function aggregateAndCacheRssFeeds() {
    console.log('Starting RSS aggregation and caching process...');
    // Initialize RSSParser with a User-Agent to improve success rate for some feeds
    const rssParser = new RSSParser({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    let allAggregatedArticles = [];

    try {
        // 1. Fetch the Google Sheet to get RSS feed URLs
        const sheetResponse = await axios.get(GOOGLE_SHEET_COMPREHENSIVE_ARCHIVE_URL);
        const archiveData = parseCSV(sheetResponse.data);

        // Filter for unique RSS feeds that have a valid URL
        const rssSources = archiveData.filter(item => 
            item.RSSFeed && item.RSSFeed.startsWith('http')
        );

        const uniqueRssUrls = new Set();
        for (const source of rssSources) {
            uniqueRssUrls.add(source.RSSFeed);
        }

        // 2. Fetch articles from each unique RSS feed
        for (const rssUrl of Array.from(uniqueRssUrls)) {
            try {
                console.log(`  Fetching RSS from: ${rssUrl}`);
                const feed = await rssParser.parseURL(rssUrl);
                
                if (feed && feed.items) {
                    feed.items.forEach(item => {
                        const originalSource = archiveData.find(d => d.RSSFeed === rssUrl);
                        
                        allAggregatedArticles.push({
                            title: item.title || 'Untitled',
                            link: item.link,
                            description: item.contentSnippet || item.summary || item.description ? 
                                (item.contentSnippet || item.summary || item.description).replace(/<[^>]*>?/gm, '').substring(0, 300) + '...' : 'No description available.',
                            pubDate: item.pubDate,
                            creator: item.creator || item.author,
                            feedTitle: feed.title,
                            // Store original image URL for later download attempt
                            originalImageUrl: extractImageFromRssItem(item),
                            imageUrl: null, // Will be populated after download attempt
                            field: originalSource ? originalSource.Field : 'Unknown',
                            fieldNormalized: originalSource ? originalSource.FieldNormalized : ['unknown']
                        });
                    });
                }
            } catch (rssError) {
                console.error(`Error fetching or parsing RSS feed ${rssUrl}:`, rssError.message);
            }
        }

        // 3. Sort articles by publication date (newest first)
        allAggregatedArticles.sort((a, b) => {
            const dateA = Date.parse(a.pubDate);
            const dateB = Date.parse(b.pubDate);

            if (isNaN(dateA) && isNaN(dateB)) return 0;
            if (isNaN(dateA)) return 1; 
            if (isNaN(dateB)) return -1; 

            return dateB - dateA;
        });
        
        // NEW: 4. Download and cache images for each article
        console.log('Starting image download and caching...');
        const processedArticles = [];
        // Ensure image cache directory exists
        if (!fs.existsSync(IMAGE_CACHE_DIR)) {
            fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
        }

        for (const article of allAggregatedArticles) {
            if (article.originalImageUrl) {
                try {
                    // Generate a unique filename for the image based on link and timestamp
                    // Clean filename: replace invalid chars with underscores, add unique timestamp
                    const filenameBase = path.basename(article.link || 'no-link').replace(/[^a-zA-Z0-9.-]/g, '_');
                    const filename = `${filenameBase.substring(0, 50)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`; // Shorten base, add random string
                    const imagePath = path.join(IMAGE_CACHE_DIR, filename);
                    const imageUrlOnBackend = `/images/${filename}`; // URL for frontend to fetch from your backend

                    const imageResponse = await axios.get(article.originalImageUrl, { responseType: 'arraybuffer' });
                    
                    // Basic check for image content type
                    if (imageResponse.headers['content-type'] && imageResponse.headers['content-type'].startsWith('image')) {
                        fs.writeFileSync(imagePath, imageResponse.data);
                        article.imageUrl = imageUrlOnBackend; // Update imageUrl to point to your backend
                    } else {
                        console.warn(`  Skipping non-image content (type: ${imageResponse.headers['content-type'] || 'unknown'}) from ${article.originalImageUrl.substring(0, 100)}...`);
                        article.imageUrl = null; // Ensure it's null if not an image
                    }
                } catch (imageDownloadError) {
                    console.error(`  Error downloading image for ${article.originalImageUrl}:`, imageDownloadError.message.substring(0, 100));
                    article.imageUrl = null; // Ensure it's null if download fails
                }
            }
            processedArticles.push(article);
        }
        allAggregatedArticles = processedArticles;
        console.log('Image download and caching complete.');

        // 5. Cache the aggregated data to a file (using the updated allAggregatedArticles with local image URLs)
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(allAggregatedArticles, null, 2), 'utf8');
        cachedRssData = allAggregatedArticles; // Also update in-memory cache
        console.log(`RSS data successfully aggregated and cached. Total articles: ${allAggregatedArticles.length}`);

    } catch (error) {
        console.error('Fatal error during RSS aggregation:', error.message);
        // If cache file exists, try to load it into memory to continue serving old data
        if (fs.existsSync(CACHE_FILE_PATH)) {
            try {
                cachedRssData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
                console.log('Loaded previous cache due to new aggregation error.');
            } catch (loadError) {
                console.error('Failed to load previous cache:', loadError.message);
            }
        }
    }
}

// --- API Endpoint ---
app.get('/api/field-rss', (req, res) => {
    const fieldParam = req.query.field;
    
    if (!fs.existsSync(CACHE_FILE_PATH)) {
        console.warn('Cache file not found. Data might not be ready yet.');
        return res.status(503).json({ message: 'RSS data not yet cached. Please try again in a few minutes.' });
    }

    try {
        const data = cachedRssData.length > 0 ? cachedRssData : JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));

        let filteredData = data;
        if (fieldParam) {
            const normalizedFieldParam = fieldParam.toLowerCase(); // FieldParam from URL is already hyphenated lowercase
            filteredData = data.filter(item => 
                item.fieldNormalized && item.fieldNormalized.includes(normalizedFieldParam)
            );
        }
        res.json(filteredData);

    } catch (error) {
        console.error('Error serving RSS data:', error.message);
        res.status(500).json({ message: 'Error retrieving RSS data.' });
    }
});

// --- Start Server & Schedule Cache Updates ---
// For local development, still use app.listen
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
        // Ensure data and public/images directories exist
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data'));
        }
        if (!fs.existsSync(IMAGE_CACHE_DIR)) {
            fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
        }
        await aggregateAndCacheRssFeeds(); // Initial aggregation on local start
        cron.schedule(CACHE_UPDATE_SCHEDULE, () => { // Schedule on local start
            aggregateAndCacheRssFeeds();
        });
    });
}

// Export the Express app as a serverless function for Netlify
// This means Netlify will call your app directly as an HTTP endpoint
module.exports.handler = serverless(app);
module.exports.aggregateAndCacheRssFeeds = aggregateAndCacheRssFeeds;
