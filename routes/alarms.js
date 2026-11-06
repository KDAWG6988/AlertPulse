/**
 * routes/alarms.js — Alarm ingestion and triage feed.
 * Owns: /api/alarms/stream, /api/alarms/recent, /api/alarms/actionable, /api/alarms/stats
 */
const express = require('express');
const router = express.Router();
const { getRecentAlarms, getActionableAlarms, getStats, getAlarmEventById } = require('../db/alarms');
const { getFeed, stop, isActive } = require('../services/stream-controller');
const { classify } = require('../services/triage-engine');
const { insertAlarmEvent, insertTriageDecision } = require('../db/alarms');
const { toObservation } = require('../lib/fhir');

// GET /api/alarms/stream — live feed from in-memory ring buffer
router.get('/stream', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const feed = getFeed(50).filter(e => e.id > since);
  res.json({ alarms: feed, stream_active: isActive() });
});

// GET /api/alarms/recent — last N alarms with triage decisions
router.get('/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const result = await getRecentAlarms({ limit });
    res.json({ alarms: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alarms/actionable — ranked feed of true signals
router.get('/actionable', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  try {
    const result = await getActionableAlarms({ limit });
    res.json({ alarms: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alarms/stats — session triage stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({ ...stats, stream_active: isActive() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alarms/:id/fhir — FHIR R4 Observation export (stub / export only).
// DEMO ONLY: converts the stored event + latest triage decision to an
// Observation. No EMR connection — nothing is sent to a hospital system.
router.get('/:id/fhir', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid alarm id' });
    const row = await getAlarmEventById(id);
    if (!row) return res.status(404).json({ error: 'Alarm not found' });
    const event = {
      id: row.id, event_type: row.event_type, source: row.source, param: row.param,
      value: row.value, unit: row.unit, severity: row.severity,
      raw_context: row.raw_context, created_at: row.created_at,
    };
    const decision = row.action ? {
      action: row.action, confidence: row.confidence, priority_score: row.priority_score,
      reason: row.reason, rule_applied: row.rule_applied, suppression_category: row.suppression_category,
    } : null;
    res.json(toObservation(event, decision));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alarms/ingest — manual alarm ingestion (for testing or integration)
router.post('/ingest', async (req, res) => {
  try {
    const alarm = req.body;
    if (!alarm.eventType || !alarm.source || !alarm.param || !alarm.value) {
      return res.status(400).json({ error: 'Missing required fields: eventType, source, param, value' });
    }
    const event = await insertAlarmEvent(alarm);
    const decision = classify({ ...alarm, id: event.id });
    await insertTriageDecision(decision);
    res.json({ event, decision });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;