/**
 * routes/patent.js — Patent tracking API.
 * Owns: /api/patent/* endpoints (cases, reminders, attorneys, prior art).
 * Auth: requires x-admin-secret header (same as admin routes).
 */
const express = require('express');
const router = express.Router();
const {
  createPatentCase,
  getPatentCases,
  updatePatentCase,
  createReminder,
  getUpcomingReminders,
  markReminderSent,
  markReminderCompleted,
  upsertAttorney,
  getAttorneys,
  addPriorArtRef,
  getPriorArtByCase,
} = require('../db/patent');

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_SECRET || req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/patent/cases
router.get('/cases', requireAdmin, async (req, res) => {
  try {
    const result = await getPatentCases();
    res.json({ cases: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patent/cases
router.post('/cases', requireAdmin, async (req, res) => {
  try {
    const { case_name, filing_date, expiry_date, case_type, jurisdiction, application_number, notes } = req.body;
    if (!case_name || !filing_date || !expiry_date || !case_type) {
      return res.status(400).json({ error: 'Missing required: case_name, filing_date, expiry_date, case_type' });
    }
    const row = await createPatentCase({ case_name, filing_date, expiry_date, case_type, jurisdiction, application_number, notes });
    res.json({ case: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/patent/cases/:id
router.patch('/cases/:id', requireAdmin, async (req, res) => {
  try {
    const row = await updatePatentCase(parseInt(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    res.json({ case: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patent/reminders — upcoming reminders (public: used by cron trigger)
router.get('/reminders', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const result = await getUpcomingReminders({ days });
    res.json({ reminders: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patent/reminders — create reminder
router.post('/reminders', requireAdmin, async (req, res) => {
  try {
    const { patent_case_id, reminder_date, reminder_type, title, description } = req.body;
    if (!patent_case_id || !reminder_date || !reminder_type || !title) {
      return res.status(400).json({ error: 'Missing required: patent_case_id, reminder_date, reminder_type, title' });
    }
    const row = await createReminder({ patent_case_id, reminder_date, reminder_type, title, description });
    res.json({ reminder: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/patent/reminders/:id/sent — mark reminder as sent
router.patch('/reminders/:id/sent', async (req, res) => {
  try {
    const row = await markReminderSent(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ reminder: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/patent/reminders/:id/completed
router.patch('/reminders/:id/completed', requireAdmin, async (req, res) => {
  try {
    const row = await markReminderCompleted(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ reminder: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patent/attorneys
router.get('/attorneys', async (req, res) => {
  try {
    const result = await getAttorneys({ specialty: req.query.specialty });
    res.json({ attorneys: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patent/attorneys — add/update attorney
router.post('/attorneys', requireAdmin, async (req, res) => {
  try {
    const { name, firm, specialty, jurisdiction, email, phone, website, rating, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing required: name' });
    const row = await upsertAttorney({ name, firm, specialty, jurisdiction, email, phone, website, rating, notes });
    res.json({ attorney: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patent/prior-art/:caseId
router.get('/prior-art/:caseId', requireAdmin, async (req, res) => {
  try {
    const result = await getPriorArtByCase(parseInt(req.params.caseId));
    res.json({ references: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patent/prior-art
router.post('/prior-art', requireAdmin, async (req, res) => {
  try {
    const { patent_case_id, source, reference_type, title, url, publication_date, relevance_score, notes } = req.body;
    if (!patent_case_id || !source || !reference_type || !title) {
      return res.status(400).json({ error: 'Missing required: patent_case_id, source, reference_type, title' });
    }
    const row = await addPriorArtRef({ patent_case_id, source, reference_type, title, url, publication_date, relevance_score, notes });
    res.json({ reference: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;