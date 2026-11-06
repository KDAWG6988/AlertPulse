/**
 * jobs/patent-reminder.js — Check upcoming patent reminders and send alerts.
 * Called by polsia.toml [[crons]] schedule.
 * Sends reminder emails via company_email MCP proxy.
 *
 * Usage: node jobs/patent-reminder.js
 */
const { pool } = require('../db/index');
const https = require('https');

async function sendCompanyEmail(to, subject, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ to, subject, body });
    const req = https.request(
      {
        hostname: 'api.polsia.app',
        path: '/company-email/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.POLSIA_API_KEY || ''}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(data)); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('[PatentReminder] Checking upcoming reminders...');

  // Get reminders due in next 90 days
  const result = await pool.query(
    `SELECT pr.*, pc.case_name, pc.expiry_date, pc.case_type
     FROM patent_reminders pr
     JOIN patent_cases pc ON pc.id = pr.patent_case_id
     WHERE pr.reminder_date <= NOW() + INTERVAL '90 days'
       AND pr.status = 'pending'
     ORDER BY pr.reminder_date ASC`
  );

  if (result.rows.length === 0) {
    console.log('[PatentReminder] No pending reminders due.');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'alertpulse@polsia.app';
  const lines = ['AlertPulse — Upcoming Patent Reminders\n'];
  for (const r of result.rows) {
    const daysUntil = Math.ceil((new Date(r.reminder_date) - new Date()) / 86400000);
    lines.push(`• ${r.title} (${daysUntil} days) — ${r.case_name} [${r.case_type}]`);
    lines.push(`  Date: ${r.reminder_date} | Type: ${r.reminder_type}`);
    if (r.description) lines.push(`  ${r.description}`);
    lines.push('');
  }
  lines.push('— AlertPulse IP Agent');

  const body = lines.join('\n');
  console.log(`[PatentReminder] Sending alert to ${adminEmail}`);

  try {
    await sendCompanyEmail(adminEmail, '⚠️ Patent Reminder Alert — Action Required', body);
    // Mark all as sent
    const ids = result.rows.map(r => r.id);
    await pool.query(`UPDATE patent_reminders SET status = 'sent', sent_at = NOW() WHERE id = ANY($1)`, [ids]);
    console.log(`[PatentReminder] Alert sent. ${ids.length} reminder(s) marked sent.`);
  } catch (err) {
    console.error('[PatentReminder] Failed to send email:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[PatentReminder] Job failed:', err.message);
  process.exit(1);
});