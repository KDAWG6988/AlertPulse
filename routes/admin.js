/**
 * routes/admin.js — Admin: hospitals, alarm config, invoices, billing.
 * All endpoints require admin auth via ADMIN_SECRET env var.
 */
const express = require('express');
const router = express.Router();
const {
  listHospitals, getHospital, createHospital, updateHospital, deleteHospital,
  getAlarmConfig, upsertAlarmConfig, deleteAlarmConfig,
  listInvoices, getInvoice, createInvoice, updateInvoiceStatus,
  updateInvoiceStripeLink, deleteInvoice, generateInvoiceNumber, getInvoiceStats,
} = require('../db/clients');
const { createPaymentLink } = require('../lib/stripe-payments');

// ── Auth middleware ─────────────────────────────────────────

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.admin_secret;
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
  }
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdmin);

// ── Hospitals ───────────────────────────────────────────────

// GET /api/admin/hospitals
router.get('/hospitals', async (req, res) => {
  try {
    const result = await listHospitals();
    res.json({ hospitals: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/hospitals/:id
router.get('/hospitals/:id', async (req, res) => {
  try {
    const hospital = await getHospital(parseInt(req.params.id));
    if (!hospital) return res.status(404).json({ error: 'Not found' });
    res.json({ hospital });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/hospitals
router.post('/hospitals', async (req, res) => {
  try {
    const { name, icu_count, contact_name, contact_email, tier, status, monthly_rate_cents } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const hospital = await createHospital({ name, icu_count, contact_name, contact_email, tier, status, monthly_rate_cents });
    res.status(201).json({ hospital });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/hospitals/:id
router.put('/hospitals/:id', async (req, res) => {
  try {
    const hospital = await updateHospital(parseInt(req.params.id), req.body);
    if (!hospital) return res.status(404).json({ error: 'Not found' });
    res.json({ hospital });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/hospitals/:id
router.delete('/hospitals/:id', async (req, res) => {
  try {
    await deleteHospital(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alarm Config ────────────────────────────────────────────

// GET /api/admin/hospitals/:id/config
router.get('/hospitals/:id/config', async (req, res) => {
  try {
    const result = await getAlarmConfig(parseInt(req.params.id));
    const config = {};
    result.rows.forEach(row => { config[row.config_key] = row.config_value; });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/hospitals/:id/config
router.put('/hospitals/:id/config', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config object required' });
    const hospitalId = parseInt(req.params.id);
    const updates = [];
    for (const [key, value] of Object.entries(config)) {
      if (value === null || value === undefined) {
        await deleteAlarmConfig(hospitalId, key);
      } else {
        await upsertAlarmConfig(hospitalId, key, String(value));
        updates.push(key);
      }
    }
    res.json({ updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/hospitals/:id/config/:key
router.post('/hospitals/:id/config/:key', async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const key = req.params.key;
    const { value } = req.body;
    if (value === null || value === undefined) {
      await deleteAlarmConfig(hospitalId, key);
    } else {
      await upsertAlarmConfig(hospitalId, key, String(value));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/hospitals/:id/config/:key
router.delete('/hospitals/:id/config/:key', async (req, res) => {
  try {
    await deleteAlarmConfig(parseInt(req.params.id), req.params.key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Invoices ────────────────────────────────────────────────

// GET /api/admin/invoices — all invoices (optionally filter by hospital)
router.get('/invoices', async (req, res) => {
  try {
    const stats = await getInvoiceStats();
    res.json({ stats: stats.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/hospitals/:id/invoices
router.get('/hospitals/:id/invoices', async (req, res) => {
  try {
    const result = await listInvoices(parseInt(req.params.id));
    res.json({ invoices: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/invoices/:id — single invoice (for polling payment link status)
router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await getInvoice(parseInt(req.params.id));
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/invoices — create invoice for a hospital
router.post('/invoices', async (req, res) => {
  try {
    const { hospital_id, amount_cents, service_period_start, service_period_end, due_date } = req.body;
    if (!hospital_id || !amount_cents || !service_period_start || !service_period_end || !due_date) {
      return res.status(400).json({ error: 'hospital_id, amount_cents, service_period_start, service_period_end, due_date required' });
    }
    const invoice_number = await generateInvoiceNumber();
    const invoice = await createInvoice({ hospital_id, invoice_number, amount_cents, service_period_start, service_period_end, due_date });
    res.status(201).json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/invoices/:id/generate-payment-link
// Queues a Stripe payment link request via the Polsia agent.
// The agent picks it up, calls stripe.create_payment_link, and updates the invoice.
// Admin polls the invoice endpoint to get the resulting URL.
router.post('/invoices/:id/generate-payment-link', async (req, res) => {
  try {
    const invoice = await getInvoice(parseInt(req.params.id));
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const hospital = await getHospital(invoice.hospital_id);
    const amountDollars = parseFloat((invoice.amount_cents / 100).toFixed(2));

    const result = await createPaymentLink({
      name: `AlertPulse Invoice ${invoice.invoice_number}`,
      amount: amountDollars,
      description: `Hospital: ${hospital.name} | Period: ${invoice.service_period_start} to ${invoice.service_period_end}`,
      success_url: `${process.env.APP_URL || 'https://alertpulse.polsia.app'}/admin/invoices/${invoice.id}?paid=1`,
      invoiceId: invoice.id,
    });

    res.json({
      request_id: result.request_id,
      status: 'pending',
      message: 'Payment link creation queued. Refresh invoice in ~10s for the Stripe URL.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/invoices/:id/status — mark paid / overdue
router.put('/invoices/:id/status', async (req, res) => {
  try {
    const { status, paid_at } = req.body;
    if (!status || !['pending', 'paid', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, paid, or overdue' });
    }
    const invoice = await updateInvoiceStatus(parseInt(req.params.id), status, paid_at);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/invoices/:id
router.delete('/invoices/:id', async (req, res) => {
  try {
    await deleteInvoice(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;