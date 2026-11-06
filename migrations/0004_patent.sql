-- 0004_patent.sql — Patent cases, attorneys, reminders, prior art.
-- Columns match db/patent.js and jobs/patent-reminder.js exactly.
-- Notes on inferred defaults (not set by the code):
--   patent_cases.status DEFAULT 'pending' (updatePatentCase writes it).
--   patent_reminders.status DEFAULT 'pending'; patent_attorneys.rating is
--     NUMERIC(3,1) (code only orders by it); prior_art_references.relevance_score
--     is NUMERIC(5,2) (code only orders by it).
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS patent_cases (
  id SERIAL PRIMARY KEY,
  case_name VARCHAR(255) NOT NULL,
  filing_date DATE,
  expiry_date DATE,
  case_type VARCHAR(100),
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'US',
  application_number VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patent_attorneys (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  firm VARCHAR(255),
  specialty VARCHAR(255),
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'US',
  email VARCHAR(255),
  phone VARCHAR(100),
  website VARCHAR(255),
  rating NUMERIC(3,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, firm)
);

CREATE TABLE IF NOT EXISTS patent_reminders (
  id SERIAL PRIMARY KEY,
  patent_case_id INTEGER NOT NULL REFERENCES patent_cases(id) ON DELETE CASCADE,
  reminder_date TIMESTAMPTZ,
  reminder_type VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prior_art_references (
  id SERIAL PRIMARY KEY,
  patent_case_id INTEGER NOT NULL REFERENCES patent_cases(id) ON DELETE CASCADE,
  source VARCHAR(255),
  reference_type VARCHAR(100),
  title TEXT NOT NULL,
  url TEXT,
  publication_date DATE,
  relevance_score NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patent_reminders_patent_case_id_idx ON patent_reminders(patent_case_id);
CREATE INDEX IF NOT EXISTS prior_art_references_patent_case_id_idx ON prior_art_references(patent_case_id);
