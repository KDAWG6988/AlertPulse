-- 0002_clients.sql — Hospitals, per-hospital alarm config, and invoices.
-- Columns match db/clients.js exactly (list/get/create/update hospitals,
-- getAlarmConfig/upsertAlarmConfig, list/get/create/update invoices,
-- generateInvoiceNumber, getInvoiceStats).
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS hospitals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  icu_count INTEGER NOT NULL DEFAULT 1,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  tier VARCHAR(50) NOT NULL DEFAULT 'basic',
  status VARCHAR(50) NOT NULL DEFAULT 'lead',
  monthly_rate_cents INTEGER NOT NULL DEFAULT 2900,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_alarm_config (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  config_key VARCHAR(255) NOT NULL,
  config_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, config_key)
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  service_period_start DATE,
  service_period_end DATE,
  due_date DATE,
  stripe_payment_link_id VARCHAR(255),
  stripe_checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_hospital_id_idx ON invoices(hospital_id);
CREATE INDEX IF NOT EXISTS hospital_alarm_config_hospital_id_idx ON hospital_alarm_config(hospital_id);
