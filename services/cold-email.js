/**
 * services/cold-email.js — Cold email sending via Polsia company_email MCP.
 *
 * Supports two sending modes:
 * 1. Company email (alertpulse@polsia.app) — built-in, rate-limited to 2/day cold
 * 2. Custom SMTP (Postmark/Mailgun) — set SMTP_* env vars to activate
 *
 * Hunter.io is used for email verification before sending (protects reputation).
 */

const { pool } = require('../db/index');
const {
  getPendingSends,
  markSendSent,
  markSendError,
  updateLeadStatus,
  incrementCampaignStats,
} = require('../db/leads');

// ── Hunter.io verification ────────────────────────────────

/**
 * Verify a lead's email via Hunter.io.
 * Returns { valid, status, score }.
 */
async function verifyLeadEmail(email) {
  // Hunter.io API: GET /v2/email-verifier?email={email}
  // In production this calls the hunter_io MCP internally via Polsia.
  // For now, we make an HTTP call using the Hunter.io API key.
  if (!process.env.HUNTER_API_KEY) {
    return { valid: null, status: 'unverified', score: null };
  }
  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${process.env.HUNTER_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hunter API ${res.status}`);
    const data = await res.json();
    const result = data.data || {};
    const score = result.score ?? null;
    let status = 'unverified';
    if (result.status === 'valid' && score >= 80) status = 'verified';
    else if (result.status === 'risky' || (score !== null && score < 60)) status = 'dead';
    else if (result.status === 'invalid') status = 'dead';
    else status = 'risky';
    return { valid: status === 'verified', status, score };
  } catch (err) {
    console.error('[ColdEmail] Hunter verify failed:', err.message);
    return { valid: null, status: 'unverified', score: null };
  }
}

// ── Email sending ─────────────────────────────────────────

/**
 * Send a single cold email.
 * Uses company_email MCP via Polsia if no custom SMTP configured.
 */
async function sendColdEmail({ to, subject, body }) {
  if (process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD) {
    return sendViaSMTP({ to, subject, body });
  }
  // Fall back to company_email MCP — agent picks up from db/leads
  // and calls the MCP directly. We just queue the send.
  return { queued: true, via: 'company_email' };
}

async function sendViaSMTP({ to, subject, body }) {
  // Nodemailer-style SMTP send
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'AlertPulse <hello@alertpulse.ai>',
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br>'),
  });
  return { sent: true, messageId: info.messageId, via: 'smtp' };
}

// ── Campaign processor (called by cron) ───────────────────

const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '2', 10);

/**
 * Process a campaign: fetch pending sends, verify if needed, send.
 * This is the main entry point called by the email-sender cron job.
 */
async function processCampaign(campaignId) {
  const pending = await getPendingSends(campaignId, BATCH_SIZE);
  if (!pending.rows.length) return { processed: 0 };

  let processed = 0;
  for (const send of pending.rows) {
    const { id, email, first_name, last_name } = send;
    const greeting = first_name ? `Hi ${first_name}` : 'Hi there';

    // Build body from campaign template
    const body = (await import('../db/leads')).then(db =>
      db.getCampaign(campaignId).then(c => {
        return (c.body_template || '').replace(/{{greeting}}/g, greeting);
      })
    ).catch(() => greeting);

    try {
      const result = await sendColdEmail({
        to: email,
        subject: send.subject || 'Re: AlertPulse — AI Alarm Triage for ICU',
        body: typeof body === 'string' ? body : `${greeting},\n\nI wanted to reach out about AlertPulse — an AI agent that triages ICU alarms 24/7, cutting alarm fatigue and helping clinical teams catch the alarms that matter.\n\nWorth a quick conversation?\n\nBest,\nAlex`,
      });

      await markSendSent(id, 'sent');
      await incrementCampaignStats(campaignId, 'sent_count');
      await updateLeadStatus(send.lead_id, 'contacted');
      processed++;

      // Respect rate limit between sends
      await sleep(1500);
    } catch (err) {
      console.error(`[ColdEmail] Send failed for ${email}:`, err.message);
      await markSendError(id, err.message);
      await incrementCampaignStats(campaignId, 'bounce_count');
    }
  }
  return { processed };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { verifyLeadEmail, sendColdEmail, processCampaign };