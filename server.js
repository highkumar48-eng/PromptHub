import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// PropellerAds Zone IDs — set your real zone IDs in .env or here directly
const PROPELLER_ZONE_IDS = {
  slot1: parseInt(process.env.PROPELLER_ZONE_1 || '0', 10),
  slot2: parseInt(process.env.PROPELLER_ZONE_2 || '0', 10),
  slot3: parseInt(process.env.PROPELLER_ZONE_3 || '0', 10),
  slot4: parseInt(process.env.PROPELLER_ZONE_4 || '0', 10),
};

// Set up template engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Serve static files from the "public" directory
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cache variables
let cachedPrompts = null;
let lastFetchTime = 0;

// In-memory views counter: { 'KEYWORD': count }
const viewsCounter = {};

/**
 * Custom state-machine CSV parser to handle newlines, commas, and quotes within cells safely.
 */
function parseCSV(csvText) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // Skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push("");
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row.map(cell => cell.trim()));
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row.map(cell => cell.trim()));
  }
  return lines;
}

/**
 * Converts raw parsed CSV matrix to mapped prompt objects.
 */
function convertCSVToPrompts(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  // Normalize headers (strip spaces, lowercase)
  const headers = rows[0].map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
  const prompts = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip empty lines
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const promptObj = {};
    headers.forEach((header, index) => {
      const cellValue = row[index] || "";

      // Match key database columns
      if (header.includes('keyword')) {
        promptObj.Keyword = cellValue;
      } else if (header.includes('title')) {
        promptObj.PromptTitle = cellValue;
      } else if (header.includes('text') || header.includes('prompt')) {
        promptObj.PromptText = cellValue;
      } else if (header.includes('image') || header.includes('preview')) {
        promptObj.PreviewImageUrl = cellValue;
      } else if (header.includes('date')) {
        promptObj.CreatedDate = cellValue;
      } else if (header.includes('status')) {
        promptObj.Status = cellValue;
      } else if (header.includes('views')) {
        promptObj.Views = parseInt(cellValue, 10) || 0;
      }
    });

    if (promptObj.Keyword) {
      prompts.push({
        Keyword: promptObj.Keyword,
        PromptTitle: promptObj.PromptTitle || `${promptObj.Keyword} Cinematic Portrait`,
        PromptText: promptObj.PromptText || "",
        PreviewImageUrl: promptObj.PreviewImageUrl || "",
        CreatedDate: promptObj.CreatedDate || new Date().toISOString().split('T')[0],
        Status: promptObj.Status || "Active",
        Views: promptObj.Views || 0,
      });
    }
  }
  return prompts;
}

/**
 * Loads mock database from local data/mock_prompts.json file.
 */
function loadMockPrompts() {
  try {
    const mockPath = path.join(process.cwd(), 'data', 'mock_prompts.json');
    if (!fs.existsSync(mockPath)) {
      console.warn("Mock database file not found at:", mockPath);
      return [];
    }
    const rawData = fs.readFileSync(mockPath, 'utf8');
    const mockData = JSON.parse(rawData);

    return mockData.map(item => ({
      Keyword: item.Keyword || item.keyword || "",
      PromptTitle: item["Prompt Title"] || item.PromptTitle || item.title || "",
      PromptText: item["Prompt Text"] || item.PromptText || item.prompt || "",
      PreviewImageUrl: item["Preview Image URL"] || item.PreviewImageUrl || item.image || "",
      CreatedDate: item["Created Date"] || item.CreatedDate || item.date || "",
      Status: item.Status || item.status || "Active",
      Views: item.Views || item.views || 0,
    }));
  } catch (err) {
    console.error("Failed to load local mock prompts:", err.message);
    return [];
  }
}

/**
 * High-level database fetcher with Google Sheet URL and mock fallback.
 */
async function fetchDatabase() {
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!sheetUrl || sheetUrl.trim() === "") {
    console.log("GOOGLE_SHEET_CSV_URL is not set. Using local mock prompts database.");
    return loadMockPrompts();
  }

  try {
    console.log(`Fetching prompts from Google Sheet: ${sheetUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    const res = await fetch(sheetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const csvText = await res.text();
    const prompts = convertCSVToPrompts(csvText);
    console.log(`Loaded ${prompts.length} prompts successfully from Google Sheets.`);
    return prompts;
  } catch (error) {
    console.error("Error fetching Google Sheets database, falling back to local JSON:", error.message);
    return loadMockPrompts();
  }
}

/**
 * Returns database contents with memory caching.
 */
async function getPrompts() {
  const cacheTtl = parseInt(process.env.CACHE_TTL_MS || '300000', 10);
  const now = Date.now();

  if (!cachedPrompts || (now - lastFetchTime) > cacheTtl) {
    cachedPrompts = await fetchDatabase();
    lastFetchTime = now;
  }
  return cachedPrompts;
}

// ================= ROUTING =================

// Helper to find a specific active prompt by keyword (case insensitive)
async function findActivePrompt(keyword) {
  if (!keyword) return null;
  const prompts = await getPrompts();
  const searchKey = keyword.trim().toUpperCase();
  return prompts.find(p => p.Keyword.trim().toUpperCase() === searchKey && p.Status.trim().toLowerCase() === 'active');
}

/**
 * Returns in-memory view count for a keyword, merging with base views from DB.
 */
function getViewCount(promptObj) {
  const key = promptObj.Keyword.trim().toUpperCase();
  const baseViews = promptObj.Views || 0;
  const sessionViews = viewsCounter[key] || 0;
  return baseViews + sessionViews;
}

// 1. Homepage Route
app.get('/', (req, res) => {
  res.render('index', {
    title: 'PromptHub - Find Viral AI Prompts Instantly',
    metaDescription: 'Find viral AI image generation prompts instantly from Instagram reels. Enter the keyword to get the exact prompt under 10 seconds.',
    propellerZoneId: PROPELLER_ZONE_IDS.slot1,
  });
});

// 2. Search Handler Route
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    if (!query) {
      return res.redirect('/');
    }

    // Check if keyword exists in our database
    const foundPrompt = await findActivePrompt(query);
    if (foundPrompt) {
      // Redirect to the dynamic prompt URL in lowercase
      return res.redirect(`/prompt/${encodeURIComponent(query.toLowerCase())}`);
    } else {
      // Render the 404 page (Prompt Not Found) but preserve search query for layout
      return res.status(404).render('404', {
        title: 'Prompt Not Found - PromptHub',
        metaDescription: 'The requested AI prompt keyword was not found on PromptHub.',
        query: query,
        propellerZoneId: 0,
      });
    }
  } catch (err) {
    console.error('Search route error:', err.message);
    res.status(500).render('404', {
      title: 'Error - PromptHub',
      metaDescription: 'An unexpected error occurred.',
      query: '',
      propellerZoneId: 0,
    });
  }
});

// 3. Dynamic Prompt Page Route — also increments view count
app.get('/prompt/:keyword', async (req, res) => {
  try {
    const keyword = req.params.keyword;
    const promptItem = await findActivePrompt(keyword);

    if (!promptItem) {
      return res.status(404).render('404', {
        title: 'Prompt Not Found - PromptHub',
        metaDescription: 'The requested AI prompt keyword was not found on PromptHub.',
        query: keyword,
        propellerZoneId: 0,
      });
    }

    // FEATURE 5: Increment in-memory views counter
    const key = promptItem.Keyword.trim().toUpperCase();
    viewsCounter[key] = (viewsCounter[key] || 0) + 1;

    // Merge base views + session views
    const promptWithViews = {
      ...promptItem,
      Views: getViewCount(promptItem),
    };

    res.render('prompt', {
      title: `${promptItem.PromptTitle} - PromptHub`,
      metaDescription: `Get the exact AI prompt for "${promptItem.PromptTitle}". Copy instantly to generate high-quality AI images.`,
      prompt: promptWithViews,
      propellerZoneId: PROPELLER_ZONE_IDS.slot2,
    });
  } catch (err) {
    console.error('Prompt route error:', err.message);
    res.status(500).render('404', {
      title: 'Error - PromptHub',
      metaDescription: 'An unexpected error occurred.',
      query: '',
      propellerZoneId: 0,
    });
  }
});

// 4. Browse All Prompts Route
app.get('/browse', async (req, res) => {
  try {
    const allPrompts = await getPrompts();
    const activePrompts = allPrompts.filter(p => p.Status.trim().toLowerCase() === 'active');

    res.render('browse', {
      title: 'Browse All AI Prompts - PromptHub',
      metaDescription: 'Browse all available AI image generation prompts on PromptHub. Find the perfect prompt for your next AI artwork.',
      prompts: activePrompts,
      propellerZoneId: PROPELLER_ZONE_IDS.slot4,
    });
  } catch (err) {
    console.error('Browse route error:', err.message);
    res.status(500).render('404', {
      title: 'Error - PromptHub',
      metaDescription: 'An unexpected error occurred.',
      query: '',
      propellerZoneId: 0,
    });
  }
});

// 5. Privacy Policy Page
app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', {
    title: 'Privacy Policy - PromptHub',
    metaDescription: 'Read PromptHub\'s Privacy Policy. We collect no personal data. Learn about our use of PropellerAds and third-party advertising.',
    propellerZoneId: 0,
  });
});

// 6. About Page
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About PromptHub - Find Viral AI Prompts from Instagram Reels',
    metaDescription: 'Learn about PromptHub — the fastest way to find exact AI image generation prompts from viral Instagram Reels. 100% free.',
    propellerZoneId: 0,
  });
});

// 7. API endpoint to trigger manual cache reload (optional, protect in production)
app.get('/api/refresh', async (req, res) => {
  try {
    cachedPrompts = await fetchDatabase();
    lastFetchTime = Date.now();
    res.json({ success: true, count: cachedPrompts.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Fallback 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found - PromptHub',
    metaDescription: 'Page not found on PromptHub.',
    query: '',
    propellerZoneId: 0,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`PromptHub server running at http://localhost:${PORT}`);
});
