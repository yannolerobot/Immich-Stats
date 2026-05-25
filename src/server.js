const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const IMMICH_URL = (process.env.IMMICH_URL || '').replace(/\/$/, '');
const IMMICH_API_KEY = process.env.IMMICH_API_KEY || '';

if (!IMMICH_URL || !IMMICH_API_KEY) {
  console.error('ERROR: IMMICH_URL and IMMICH_API_KEY environment variables are required.');
  process.exit(1);
}

// Optional Postgres connection (for per-day breakdown)
const DB_HOST = process.env.DB_HOSTNAME || process.env.DB_HOST || null;
const dbPool = DB_HOST ? new Pool({
  host: DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE_NAME || 'immich',
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 3,
}) : null;

if (dbPool) {
  console.log(`Postgres connection configured: ${DB_HOST}`);
} else {
  console.log('No DB_HOSTNAME set — daily breakdown will not be available');
}

const headers = {
  'x-api-key': IMMICH_API_KEY,
  'Accept': 'application/json',
};

async function immichFetch(endpoint) {
  const url = `${IMMICH_URL}/api${endpoint}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Immich API error ${res.status} for ${endpoint}: ${text}`);
  }
  return res.json();
}

// GET /server/statistics returns { usageByUser: [{ userId, userName, photos, videos, usage }] }
// This correctly returns per-user totals as an admin — but all-time, not date-filtered.
async function getServerStats() {
  return immichFetch('/server/statistics');
}

// GET /admin/users for name/email details
async function getAdminUsers() {
  const data = await immichFetch('/admin/users?limit=200');
  return Array.isArray(data) ? data : (data.users || data.items || []);
}

// Query Postgres directly for per-user, per-day upload counts within a window.
// Returns: [{ userId, date, images, videos }]
async function getDailyCountsFromDB(days) {
  if (!dbPool) return null;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const query = `
    SELECT
      "ownerId" AS "userId",
      DATE("createdAt" AT TIME ZONE 'UTC') AS date,
      COUNT(*) FILTER (WHERE type = 'IMAGE') AS images,
      COUNT(*) FILTER (WHERE type = 'VIDEO') AS videos
    FROM asset
    WHERE "createdAt" >= $1
      AND "deletedAt" IS NULL
    GROUP BY "ownerId", DATE("createdAt" AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `;

  const result = await dbPool.query(query, [since.toISOString()]);
  return result.rows;
}

// Build empty daily slots for N days
function emptyDays(days) {
  const slots = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    slots[d.toISOString().slice(0, 10)] = { images: 0, videos: 0 };
  }
  return slots;
}

// Main stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);

    // Fetch all in parallel
    const [serverStats, adminUsers, dbRows] = await Promise.all([
      getServerStats(),
      getAdminUsers(),
      getDailyCountsFromDB(days),
    ]);

    const usageByUser = serverStats.usageByUser || [];

    // Build a lookup of admin user details by id
    const userDetails = {};
    for (const u of adminUsers) {
      userDetails[u.id] = u;
    }

    // Build per-user daily breakdown from DB rows (if available)
    // dbRows: [{ userId, date (Date obj), images, videos }]
    const dailyByUser = {};
    if (dbRows) {
      for (const row of dbRows) {
        const uid = row.userId;
        if (!dailyByUser[uid]) dailyByUser[uid] = emptyDays(days);
        const dateKey = row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
        if (dateKey in dailyByUser[uid]) {
          dailyByUser[uid][dateKey].images += parseInt(row.images) || 0;
          dailyByUser[uid][dateKey].videos += parseInt(row.videos) || 0;
        }
      }
    }

    // Also compute per-user totals within the window from DB rows
    const windowTotalsByUser = {};
    if (dbRows) {
      for (const row of dbRows) {
        const uid = row.userId;
        if (!windowTotalsByUser[uid]) windowTotalsByUser[uid] = { images: 0, videos: 0 };
        windowTotalsByUser[uid].images += parseInt(row.images) || 0;
        windowTotalsByUser[uid].videos += parseInt(row.videos) || 0;
      }
    }

    const userStats = usageByUser.map((u) => {
      const details = userDetails[u.userId] || {};
      const windowTotals = windowTotalsByUser[u.userId] || { images: 0, videos: 0 };
      const dailySlots = dailyByUser[u.userId] || emptyDays(days);

      // Use DB window counts if available, otherwise fall back to all-time from API
      const images = dbRows ? windowTotals.images : u.photos;
      const videos = dbRows ? windowTotals.videos : u.videos;

      const dailyBreakdown = Object.entries(dailySlots)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, c]) => ({ date, images: c.images, videos: c.videos, count: c.images + c.videos }));

      console.log(`  user "${u.userName}" (${u.userId.slice(0,8)}...): ${images} images, ${videos} videos in window`);

      return {
        id: u.userId,
        name: u.userName || details.email || u.userId,
        email: details.email || '',
        images,
        videos,
        total: images + videos,
        allTimePhotos: u.photos,
        allTimeVideos: u.videos,
        dailyBreakdown,
      };
    }).filter(u => userDetails[u.id] && !userDetails[u.id].deletedAt);

    userStats.sort((a, b) => b.total - a.total);

    const totalImages = userStats.reduce((s, u) => s + u.images, 0);
    const totalVideos = userStats.reduce((s, u) => s + u.videos, 0);

    res.json({
      days,
      dbConnected: !!dbPool,
      generatedAt: new Date().toISOString(),
      immichUrl: IMMICH_URL,
      summary: {
        totalUsers: userStats.length,
        activeUploaders: userStats.filter(u => u.total > 0).length,
        totalImages,
        totalVideos,
        totalAssets: totalImages + totalVideos,
      },
      users: userStats,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Immich Stats dashboard running on port ${PORT}`);
  console.log(`Immich server: ${IMMICH_URL}`);
});
