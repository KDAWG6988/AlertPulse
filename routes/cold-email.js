/**
 * routes/cold-email.js — Admin: leads, campaigns, cold email sends.
 * Requires ADMIN_SECRET auth via x-admin-secret header.
 */
const express = require('express');
const router = express.Router();
const {
  listLeads, getLead, upsertLead, updateLeadStatus, deleteLead, updateLeadVerifyStatus,
  listCampaigns, getCampaign, createCampaign, updateCampaignStatus, deleteCampaign,
  queueSends, getSendStats,
} = require('../db/leads');
const { verifyLeadEmail, processCampaign } = require('../services/cold-email');
const { getHospital } = require('../db/clients');

// ── Auth ─────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.admin_secret;
  if (!process.env.ADMIN_SECRET) return res.status(500).json({ error: 'ADMIN_SECRET not configured' });
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(requireAdmin);

// ── Leads ────────────────────────────────────────────────

// GET /api/cold-email/leads
router.get('/leads', async (req, res) => {
  try {
    const { status, email_verified, limit, offset } = req.query;
    const result = await listLeads({
      status,
      email_verified: email_verified !== undefined ? email_verified === 'true' : undefined,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
    });
    res.json({ leads: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cold-email/leads/:id
router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/leads — add or update a lead
router.post('/leads', async (req, res) => {
  try {
    const { first_name, last_name, email, company, title, hospital_id, source } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    const lead = await upsertLead({ first_name, last_name, email, company, title, hospital_id, source });
    res.status(201).json({ lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/leads/verify/:id — verify lead email via Hunter.io
router.post('/leads/verify/:id', async (req, res) => {
  try {
    const lead = await getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const result = await verifyLeadEmail(lead.email);
    await updateLeadVerifyStatus(lead.id, result.valid, result.status);
    res.json({ lead_id: lead.id, email: lead.email, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/leads/verify-batch — verify multiple leads
router.post('/leads/verify-batch', async (req, res) => {
  try {
    const { lead_ids } = req.body;
    if (!Array.isArray(lead_ids) || !lead_ids.length) {
      return res.status(400).json({ error: 'lead_ids array required' });
    }
    const results = [];
    for (const id of lead_ids) {
      const lead = await getLead(parseInt(id));
      if (!lead) continue;
      const result = await verifyLeadEmail(lead.email);
      await updateLeadVerifyStatus(lead.id, result.valid, result.status);
      results.push({ lead_id: lead.id, email: lead.email, ...result });
      await sleep(500); // rate limit Hunter
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cold-email/leads/:id/status
router.put('/leads/:id/status', async (req, res) => {
  try {
    const lead = await updateLeadStatus(parseInt(req.params.id), req.body.status);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cold-email/leads/:id
router.delete('/leads/:id', async (req, res) => {
  try {
    await deleteLead(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campaigns ────────────────────────────────────────────

// GET /api/cold-email/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await listCampaigns();
    res.json({ campaigns: campaigns.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cold-email/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await getCampaign(parseInt(req.params.id));
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const stats = await getSendStats(parseInt(req.params.id));
    res.json({ campaign, send_stats: stats.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, subject, body_template, target_audience } = req.body;
    if (!name || !subject || !body_template) {
      return res.status(400).json({ error: 'name, subject, body_template required' });
    }
    const campaign = await createCampaign({ name, subject, body_template, target_audience });
    res.status(201).json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cold-email/campaigns/:id — update status (send/pause/complete)
router.put('/campaigns/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const campaign = await updateCampaignStatus(parseInt(req.params.id), status);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/campaigns/:id/queue — queue leads for sending
router.post('/campaigns/:id/queue', async (req, res) => {
  try {
    const { lead_ids } = req.body;
    if (!Array.isArray(lead_ids) || !lead_ids.length) {
      return res.status(400).json({ error: 'lead_ids array required' });
    }
    const result = await queueSends(parseInt(req.params.id), lead_ids);
    res.json({ queued: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/campaigns/:id/queue-all-verified
router.post('/campaigns/:id/queue-all-verified', async (req, res) => {
  try {
    const leads = await listLeads({ email_verified: true, status: 'pending' });
    const leadIds = leads.rows.map(l => l.id);
    const result = await queueSends(parseInt(req.params.id), leadIds);
    res.json({ queued: result.rowCount, total_verified_leads: leadIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cold-email/campaigns/:id/send — trigger sending (calls processCampaign)
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    await updateCampaignStatus(parseInt(req.params.id), 'sending');
    const result = await processCampaign(parseInt(req.params.id));
    res.json({ processed: result.processed, status: 'sending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cold-email/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    await deleteCampaign(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;