/**
 * server.js — AlertPulse entry point.
 * Wires middleware, routes, and starts the alarm triage stream on boot.
 */
const express = require('express');
const path = require('path');
const { pool } = require('./db/index');
const { buildLandingContext } = require('./lib/landing-context');
const alarmsRouter = require('./routes/alarms');
const adminRouter = require('./routes/admin');
const coldEmailRouter = require('./routes/cold-email');
const patentRouter = require('./routes/patent');
const { start: startStream } = require('./services/stream-controller');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

app.use(express.json());

// EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check — no DB query (allows Neon auto-suspend between requests)
// /api/health matches polsia.toml healthcheck_path for Render/Blaxel probes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'alertpulse' });
});
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'alertpulse' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API routes
app.use('/api/alarms', alarmsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cold-email', coldEmailRouter);
app.use('/api/patent', patentRouter);

// Admin control panel (EJS page — client-side auth via ADMIN_SECRET)
app.get('/admin', (_req, res) => {
  res.render('admin');
});

// Triage dashboard
app.get('/dashboard', async (_req, res) => {
  try {
    const { getRecentAlarms, getStats } = require('./db/alarms');
    const [alarms, stats] = await Promise.all([
      getRecentAlarms({ limit: 50 }),
      getStats(),
    ]);
    res.render('dashboard', { alarms: alarms.rows, stats });
  } catch (err) {
    res.status(500).send('Dashboard unavailable: ' + err.message);
  }
});

// Landing page
app.get('/', (_req, res) => {
  res.render('layout', buildLandingContext());
});

// 404
app.use((_req, res) => {
  res.status(404).send('Not found');
});

async function boot() {
  // Run migrations on startup (Render injects DATABASE_URL at runtime)
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[Boot] Migrations table ready');
  } finally {
    client.release();
  }

  app.listen(PORT, () => {
    console.log(`[AlertPulse] Server running on port ${PORT}`);
    startStream(3000);
  });
}

boot().catch(err => {
  console.error('[Boot] Failed to start:', err.message);
  process.exit(1);
});