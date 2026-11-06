/**
 * db/patent.js — Patent tracking: cases, reminders, attorneys, prior art.
 * Owns: patent_cases, patent_attorneys, patent_reminders, prior_art_references tables.
 */
const { pool } = require('./index');

// ─── Patent Cases ─────────────────────────────────────────────────────────────

async function createPatentCase({ case_name, filing_date, expiry_date, case_type, jurisdiction, application_number, notes }) {
  const result = await pool.query(
    `INSERT INTO patent_cases (case_name, filing_date, expiry_date, case_type, jurisdiction, application_number, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [case_name, filing_date, expiry_date, case_type, jurisdiction || 'US', application_number || null, notes || null]
  );
  return result.rows[0];
}

async function getPatentCases() {
  return pool.query('SELECT * FROM patent_cases ORDER BY filing_date DESC');
}

async function updatePatentCase(id, updates) {
  const fields = [];
  const vals = [];
  let i = 1;
  if (updates.status) { fields.push(`status = $${i++}`); vals.push(updates.status); }
  if (updates.application_number) { fields.push(`application_number = $${i++}`); vals.push(updates.application_number); }
  if (updates.notes) { fields.push(`notes = $${i++}`); vals.push(updates.notes); }
  fields.push(`updated_at = NOW()`);
  vals.push(id);
  const result = await pool.query(
    `UPDATE patent_cases SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return result.rows[0];
}

// ─── Reminders ───────────────────────────────────────────────────────────────

async function createReminder({ patent_case_id, reminder_date, reminder_type, title, description }) {
  const result = await pool.query(
    `INSERT INTO patent_reminders (patent_case_id, reminder_date, reminder_type, title, description)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [patent_case_id, reminder_date, reminder_type, title, description || null]
  );
  return result.rows[0];
}

async function getUpcomingReminders({ days = 90 } = {}) {
  return pool.query(
    `SELECT pr.*, pc.case_name, pc.expiry_date, pc.case_type
     FROM patent_reminders pr
     JOIN patent_cases pc ON pc.id = pr.patent_case_id
     WHERE pr.reminder_date <= NOW() + INTERVAL '${parseInt(days)} days'
       AND pr.status = 'pending'
     ORDER BY pr.reminder_date ASC`
  );
}

async function markReminderSent(id) {
  const result = await pool.query(
    `UPDATE patent_reminders SET status = 'sent', sent_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function markReminderCompleted(id) {
  const result = await pool.query(
    `UPDATE patent_reminders SET status = 'completed' WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

// ─── Attorneys ────────────────────────────────────────────────────────────────

async function upsertAttorney({ name, firm, specialty, jurisdiction, email, phone, website, rating, notes }) {
  const result = await pool.query(
    `INSERT INTO patent_attorneys (name, firm, specialty, jurisdiction, email, phone, website, rating, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (name, firm) DO UPDATE SET
       specialty = EXCLUDED.specialty, rating = EXCLUDED.rating, notes = EXCLUDED.notes,
       email = COALESCE(EXCLUDED.email, patent_attorneys.email)
     RETURNING *`,
    [name, firm || null, specialty || null, jurisdiction || 'US', email || null, phone || null, website || null, rating || null, notes || null]
  );
  return result.rows[0];
}

async function getAttorneys({ specialty } = {}) {
  let sql = 'SELECT * FROM patent_attorneys ORDER BY rating, name';
  const params = [];
  if (specialty) {
    sql = 'SELECT * FROM patent_attorneys WHERE specialty ILIKE $1 ORDER BY rating, name';
    params.push(`%${specialty}%`);
  }
  return pool.query(sql, params);
}

// ─── Prior Art ────────────────────────────────────────────────────────────────

async function addPriorArtRef({ patent_case_id, source, reference_type, title, url, publication_date, relevance_score, notes }) {
  const result = await pool.query(
    `INSERT INTO prior_art_references (patent_case_id, source, reference_type, title, url, publication_date, relevance_score, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [patent_case_id, source, reference_type, title, url || null, publication_date || null, relevance_score || null, notes || null]
  );
  return result.rows[0];
}

async function getPriorArtByCase(patent_case_id) {
  return pool.query(
    'SELECT * FROM prior_art_references WHERE patent_case_id = $1 ORDER BY relevance_score DESC NULLS LAST, publication_date DESC',
    [patent_case_id]
  );
}

module.exports = {
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
};