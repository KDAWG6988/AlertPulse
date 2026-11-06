-- 0001_alarms.sql — Alarm events and triage decisions.
-- Columns match db/alarms.js exactly (insertAlarmEvent, insertTriageDecision,
-- getRecentAlarms, getActionableAlarms, getStats).
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so
-- `npm run migrate` can be re-run safely.

CREATE TABLE IF NOT EXISTS alarm_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  source VARCHAR(255) NOT NULL,
  param VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  unit VARCHAR(50),
  severity VARCHAR(50),
  raw_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triage_decisions (
  id SERIAL PRIMARY KEY,
  alarm_event_id INTEGER NOT NULL REFERENCES alarm_events(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  confidence INTEGER,
  priority_score INTEGER NOT NULL DEFAULT 500,
  reason TEXT,
  rule_applied VARCHAR(100),
  suppression_category VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alarm_events_created_at_idx ON alarm_events(created_at DESC);
CREATE INDEX IF NOT EXISTS triage_decisions_alarm_event_id_idx ON triage_decisions(alarm_event_id);
CREATE INDEX IF NOT EXISTS triage_decisions_action_idx ON triage_decisions(action);
