/**
 * db/clients.js — Hospital clients and billing.
 * Owns: hospitals, hospital_alarm_config, invoices tables.
 */
const { pool } = require('./index');

// ── Hospitals ──────────────────────────────────────────────

async function listHospitals() {
  return pool.query(
    `SELECT id, name, icu_count, contact_name, contact_email,
            tier, status, monthly_rate_cents, created_at, updated_at
     FROM hospitals ORDER BY name ASC`
  );
}

async function getHospital(id) {
  const result = await pool.query(
    `SELECT id, name, icu_count, contact_name, contact_email,
            tier, status, monthly_rate_cents, created_at, updated_at
     FROM hospitals WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createHospital({ name, icu_count, contact_name, contact_email, tier, status, monthly_rate_cents }) {
  const result = await pool.query(
    `INSERT INTO hospitals (name, icu_count, contact_name, contact_email, tier, status, monthly_rate_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [name, icu_count || 1, contact_name || null, contact_email || null, tier || 'basic', status || 'lead', monthly_rate_cents || 2900]
  );
  return result.rows[0];
}

async function updateHospital(id, fields) {
  const sets = [];
  const vals = [];
  let idx = 1;
  const allowed = ['name', 'icu_count', 'contact_name', 'contact_email', 'tier', 'status', 'monthly_rate_cents'];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = $${idx++}`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return getHospital(id);
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  const result = await pool.query(
    `UPDATE hospitals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return result.rows[0] || null;
}

async function deleteHospital(id) {
  return pool.query('DELETE FROM hospitals WHERE id = $1', [id]);
}

// ── Alarm Config ────────────────────────────────────────────

async function getAlarmConfig(hospitalId) {
  return pool.query(
    `SELECT config_key, config_value FROM hospital_alarm_config WHERE hospital_id = $1`,
    [hospitalId]
  );
}

async function upsertAlarmConfig(hospitalId, configKey, configValue) {
  return pool.query(
    `INSERT INTO hospital_alarm_config (hospital_id, config_key, config_value)
     VALUES ($1,$2,$3)
     ON CONFLICT (hospital_id, config_key) DO UPDATE SET config_value = $3`,
    [hospitalId, configKey, configValue]
  );
}

async function deleteAlarmConfig(hospitalId, configKey) {
  return pool.query(
    `DELETE FROM hospital_alarm_config WHERE hospital_id = $1 AND config_key = $2`,
    [hospitalId, configKey]
  );
}

// ── Invoices ────────────────────────────────────────────────

async function listInvoices(hospitalId) {
  return pool.query(
    `SELECT id, hospital_id, invoice_number, amount_cents, status,
            service_period_start, service_period_end, due_date,
            stripe_payment_link_id, stripe_checkout_url, paid_at, created_at
     FROM invoices WHERE hospital_id = $1 ORDER BY created_at DESC`,
    [hospitalId]
  );
}

async function getInvoice(id) {
  const result = await pool.query(
    `SELECT i.*, h.name as hospital_name, h.contact_email
     FROM invoices i JOIN hospitals h ON h.id = i.hospital_id
     WHERE i.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createInvoice({ hospital_id, invoice_number, amount_cents, service_period_start, service_period_end, due_date }) {
  const result = await pool.query(
    `INSERT INTO invoices (hospital_id, invoice_number, amount_cents, service_period_start, service_period_end, due_date)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [hospital_id, invoice_number, amount_cents, service_period_start, service_period_end, due_date]
  );
  return result.rows[0];
}

async function updateInvoiceStatus(id, status, paid_at) {
  return pool.query(
    `UPDATE invoices SET status = $2, paid_at = $3 WHERE id = $1 RETURNING *`,
    [id, status, paid_at || null]
  );
}

async function updateInvoiceStripeLink(id, stripe_payment_link_id, stripe_checkout_url) {
  return pool.query(
    `UPDATE invoices SET stripe_payment_link_id = $2, stripe_checkout_url = $3 WHERE id = $1 RETURNING *`,
    [id, stripe_payment_link_id, stripe_checkout_url]
  );
}

async function deleteInvoice(id) {
  return pool.query('DELETE FROM invoices WHERE id = $1', [id]);
}

async function generateInvoiceNumber() {
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM invoices WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`
  );
  const year = new Date().getFullYear();
  const seq = parseInt(result.rows[0].cnt) + 1;
  return `AP-${year}-${String(seq).padStart(4, '0')}`;
}

async function getInvoiceStats() {
  return pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'paid') as paid,
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
       COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) as total_paid_cents,
       COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending' OR status = 'overdue'), 0) as total_pending_cents
     FROM invoices`
  );
}

module.exports = {
  listHospitals,
  getHospital,
  createHospital,
  updateHospital,
  deleteHospital,
  getAlarmConfig,
  upsertAlarmConfig,
  deleteAlarmConfig,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceStatus,
  updateInvoiceStripeLink,
  deleteInvoice,
  generateInvoiceNumber,
  getInvoiceStats,
};