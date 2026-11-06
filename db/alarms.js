/**
 * db/alarms.js — Alarm events and triage decisions.
 * Owns: alarm_events and triage_decisions tables.
 */
const { pool } = require('./index');

async function insertAlarmEvent({ eventType, source, param, value, unit, severity, rawContext }) {
  const result = await pool.query(
    `INSERT INTO alarm_events (event_type, source, param, value, unit, severity, raw_context)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [eventType, source, param, value, unit, severity, rawContext ? JSON.stringify(rawContext) : null]
  );
  return result.rows[0];
}

async function insertTriageDecision({ alarm_event_id, action, confidence, priority_score, reason, rule_applied, suppression_category }) {
  const result = await pool.query(
    `INSERT INTO triage_decisions (alarm_event_id, action, confidence, priority_score, reason, rule_applied, suppression_category)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [alarm_event_id, action, confidence, priority_score || 500, reason, rule_applied || null, suppression_category || null]
  );
  return result.rows[0];
}

async function getRecentAlarms({ limit = 50 } = {}) {
  return pool.query(
    `SELECT ae.id, ae.event_type, ae.source, ae.param, ae.value, ae.unit,
            ae.severity, ae.raw_context, ae.created_at,
            td.action, td.confidence, td.priority_score, td.reason,
            td.rule_applied, td.suppression_category, td.created_at as triaged_at
     FROM alarm_events ae
     LEFT JOIN triage_decisions td ON td.alarm_event_id = ae.id
     ORDER BY ae.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

async function getActionableAlarms({ limit = 30 } = {}) {
  return pool.query(
    `SELECT ae.id, ae.event_type, ae.source, ae.param, ae.value, ae.unit,
            ae.severity, ae.raw_context, ae.created_at,
            td.action, td.confidence, td.priority_score, td.reason,
            td.rule_applied, td.suppression_category, td.created_at as triaged_at
     FROM alarm_events ae
     JOIN triage_decisions td ON td.alarm_event_id = ae.id
     WHERE td.action = 'dispatch'
     ORDER BY td.priority_score DESC, ae.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

async function getAlarmEventById(id) {
  const result = await pool.query(
    `SELECT ae.id, ae.event_type, ae.source, ae.param, ae.value, ae.unit,
            ae.severity, ae.raw_context, ae.created_at,
            td.action, td.confidence, td.priority_score, td.reason,
            td.rule_applied, td.suppression_category, td.created_at as triaged_at
     FROM alarm_events ae
     LEFT JOIN triage_decisions td ON td.alarm_event_id = ae.id
     WHERE ae.id = $1
     ORDER BY td.created_at DESC
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getStats() {
  const [total, dispatched, suppressed] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM alarm_events'),
    pool.query("SELECT COUNT(*) as count FROM triage_decisions WHERE action = 'dispatch'"),
    pool.query("SELECT COUNT(*) as count FROM triage_decisions WHERE action = 'suppress'"),
  ]);
  return {
    total: parseInt(total.rows[0].count),
    dispatched: parseInt(dispatched.rows[0].count),
    suppressed: parseInt(suppressed.rows[0].count),
  };
}

module.exports = {
  insertAlarmEvent,
  insertTriageDecision,
  getRecentAlarms,
  getActionableAlarms,
  getAlarmEventById,
  getStats,
};