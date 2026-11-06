-- 0005_payment_links.sql — Queued Stripe payment-link requests.
-- Columns match lib/stripe-payments.js exactly: the INSERT writes
-- invoice_id, name, amount_cents, description, success_url, status.
-- stripe_payment_link_id / stripe_checkout_url are NOT written by the
-- current code; they are included here so the agent/worker that is
-- supposed to fill in the real Stripe URL (see lib/stripe-payments.js)
-- has somewhere to store it. They are inferred, not code-required.
-- DEMO ONLY: no real Stripe link is created by this app — see
-- lib/stripe-payments.js. Billing is not live.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS payment_link_requests (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  description TEXT,
  success_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  stripe_payment_link_id VARCHAR(255),
  stripe_checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_link_requests_invoice_id_idx ON payment_link_requests(invoice_id);
CREATE INDEX IF NOT EXISTS payment_link_requests_status_idx ON payment_link_requests(status);
