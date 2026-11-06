/**
 * db/leads.js — Cold email leads, campaigns, and send tracking.
 * Owns: cold_email_leads, cold_email_campaigns, cold_email_sends tables.
 */
const { pool } = require('./index');

// ── Leads ──────────────────────────────────────────────────

async function listLeads({ status, email_verified, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
  if (email_verified !== undefined) { conditions.push(`email_verified = $${params.length + 1}`); params.push(email_verified); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  return pool.query(
    `SELECT l.*, h.name as hospital_name
     FROM cold_email_leads l
     LEFT JOIN hospitals h ON h.id = l.hospital_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

async function getLead(id) {
  const result = await pool.query(`SELECT * FROM cold_email_leads WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function getLeadByEmail(email) {
  const result = await pool.query(`SELECT * FROM cold_email_leads WHERE email = $1`, [email]);
  return result.rows[0] || null;
}

async function upsertLead({ first_name, last_name, email, company, title, hospital_id, source }) {
  const result = await pool.query(
    `INSERT INTO cold_email_leads (first_name, last_name, email, company, title, hospital_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (email) DO UPDATE SET
       first_name = COALESCE(EXCLUDED.first_name, cold_email_leads.first_name),
       last_name = COALESCE(EXCLUDED.last_name, cold_email_leads.last_name),
       company = COALESCE(EXCLUDED.company, cold_email_leads.company),
       title = COALESCE(EXCLUDED.title, cold_email_leads.title),
       hospital_id = COALESCE(EXCLUDED.hospital_id, cold_email_leads.hospital_id)
     RETURNING *`,
    [first_name, last_name, email, company, title, hospital_id || null, source || 'manual']
  );
  return result.rows[0];
}

async function updateLeadStatus(id, status) {
  return pool.query(
    `UPDATE cold_email_leads SET status = $2, last_contacted_at = CASE WHEN $2 = 'contacted' THEN NOW() ELSE last_contacted_at END WHERE id = $1 RETURNING *`,
    [id, status]
  );
}

async function updateLeadVerifyStatus(id, verified, verifyStatus) {
  return pool.query(
    `UPDATE cold_email_leads SET email_verified = $2, email_verify_status = $3 WHERE id = $1 RETURNING *`,
    [id, verified, verifyStatus]
  );
}

async function deleteLead(id) {
  return pool.query('DELETE FROM cold_email_leads WHERE id = $1', [id]);
}

// ── Campaigns ──────────────────────────────────────────────

async function listCampaigns() {
  return pool.query(`SELECT * FROM cold_email_campaigns ORDER BY created_at DESC`);
}

async function getCampaign(id) {
  const result = await pool.query(`SELECT * FROM cold_email_campaigns WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function createCampaign({ name, subject, body_template, target_audience }) {
  const result = await pool.query(
    `INSERT INTO cold_email_campaigns (name, subject, body_template, target_audience)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, subject, body_template, target_audience || 'all']
  );
  return result.rows[0];
}

async function updateCampaignStatus(id, status) {
  const updates = ['status = $2'];
  if (status === 'sending') updates.push('started_at = NOW()');
  if (status === 'completed' || status === 'paused') updates.push('completed_at = NOW()');
  return pool.query(
    `UPDATE cold_email_campaigns SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    [id, status]
  );
}

async function incrementCampaignStats(id, field) {
  const allowed = ['sent_count', 'delivered_count', 'open_count', 'click_count', 'bounce_count', 'reply_count'];
  if (!allowed.includes(field)) return;
  return pool.query(
    `UPDATE cold_email_campaigns SET ${field} = ${field} + 1 WHERE id = $1 RETURNING *`,
    [id]
  );
}

async function deleteCampaign(id) {
  return pool.query('DELETE FROM cold_email_campaigns WHERE id = $1', [id]);
}

// ── Sends ──────────────────────────────────────────────────

async function queueSends(campaignId, leadIds) {
  if (!leadIds.length) return { rowCount: 0 };
  const values = leadIds.map((lid, i) => `($1, $${i + 2})`).join(', ');
  return pool.query(
    `INSERT INTO cold_email_sends (campaign_id, lead_id)
     VALUES ${values}
     ON CONFLICT DO NOTHING`,
    [campaignId, ...leadIds]
  );
}

async function getPendingSends(campaignId, limit = 10) {
  return pool.query(
    `SELECT s.*, l.email, l.first_name, l.last_name, l.company
     FROM cold_email_sends s
     JOIN cold_email_leads l ON l.id = s.lead_id
     WHERE s.campaign_id = $1 AND s.status = 'pending'
     AND l.email_verified = true
     ORDER BY s.created_at ASC
     LIMIT $2`,
    [campaignId, limit]
  );
}

async function markSendSent(id, status = 'sent') {
  return pool.query(
    `UPDATE cold_email_sends SET status = $2, sent_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
}

async function markSendError(id, errorMessage) {
  return pool.query(
    `UPDATE cold_email_sends SET status = 'bounced', error_message = $2, sent_at = NOW() WHERE id = $1`,
    [id, errorMessage]
  );
}

async function getSendStats(campaignId) {
  return pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','replied')) as sent,
       COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
       COUNT(*) FILTER (WHERE status = 'opened') as opened,
       COUNT(*) FILTER (WHERE status = 'replied') as replied
     FROM cold_email_sends WHERE campaign_id = $1`,
    [campaignId]
  );
}

module.exports = {
  listLeads,
  getLead,
  getLeadByEmail,
  upsertLead,
  updateLeadStatus,
  updateLeadVerifyStatus,
  deleteLead,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaignStatus,
  incrementCampaignStats,
  deleteCampaign,
  queueSends,
  getPendingSends,
  markSendSent,
  markSendError,
  getSendStats,
};