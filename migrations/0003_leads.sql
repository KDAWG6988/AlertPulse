-- 0003_leads.sql — Cold-email leads, campaigns, and send queue.
-- Columns match db/leads.js exactly (list/get/upsert leads, campaigns,
-- queueSends/getPendingSends/markSendSent/markSendError/getSendStats).
-- Notes on inferred defaults (not set by the code, chosen here so the
-- columns are never NULL where the code increments/filters on them):
--   cold_email_leads.status DEFAULT 'new'; email_verified DEFAULT false.
--   cold_email_campaigns.status DEFAULT 'draft'; all *_count DEFAULT 0.
--   cold_email_sends.status DEFAULT 'pending'.
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS cold_email_leads (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  company VARCHAR(255),
  title VARCHAR(255),
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verify_status VARCHAR(100),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cold_email_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject TEXT,
  body_template TEXT,
  target_audience VARCHAR(100) NOT NULL DEFAULT 'all',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cold_email_sends (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES cold_email_campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES cold_email_leads(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS cold_email_sends_campaign_id_idx ON cold_email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS cold_email_sends_lead_id_idx ON cold_email_sends(lead_id);
