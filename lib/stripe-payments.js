/**
 * lib/stripe-payments.js — Stripe payment link generation via Polsia.
 *
 * DEMO ONLY — billing is not live. No real Stripe link is created.
 * In a future production version, this would call the Polsia agent task
 * system to create a Stripe reusable payment link via the polsia_payments MCP.
 *
 * The agent picks up pending invoice payment_link requests from the
 * `payment_link_requests` table and calls stripe.create_payment_link.
 *
 * Flow: admin routes → queue request → agent polls → Stripe → record URL
 */

/**
 * DEMO ONLY — NO REAL STRIPE LINK IS CREATED HERE. Billing is not live.
 * This only queues a row in payment_link_requests for a (not yet built)
 * external agent/worker to pick up. Until such a worker exists and a
 * real Stripe account is connected, no payment link, checkout URL, or
 * charge is ever created. Do not present this as a working payment flow.
 *
 * Create a payment link request. Returns a placeholder URL immediately;
 * the agent will update the invoice with the real Stripe URL asynchronously.
 *
 * @param {object} opts
 * @param {string} opts.name           — Product/invoice name for Stripe
 * @param {number} opts.amount         — Amount in USD (e.g. 29.00)
 * @param {string} opts.description    — Line item description
 * @param {string} opts.success_url    — Post-payment redirect
 * @param {number} opts.invoiceId      — Invoice DB ID (for agent to update)
 * @returns {Promise<{url: string, request_id: number}>}
 */
async function createPaymentLink({ name, amount, description, success_url, invoiceId }) {
  const { pool } = require('../db/index');

  // Queue the request so the agent can pick it up
  const result = await pool.query(
    `INSERT INTO payment_link_requests (invoice_id, name, amount_cents, description, success_url, status)
     VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
    [invoiceId, name, Math.round(amount * 100), description, success_url]
  );

  // Return a placeholder — agent will overwrite the real Stripe URL
  // The client polls /api/admin/invoices/:id for the updated stripe_checkout_url
  // DEMO ONLY: url is null because no real Stripe link is created here.
  return {
    url: null,  // will be populated by agent — no real Stripe link exists yet
    request_id: result.rows[0].id,
    note: 'DEMO ONLY — no real Stripe payment link was created and billing is not live. Request queued (id ' + result.rows[0].id + ') for a future worker; refresh the invoice to check.',
  };
}

module.exports = { createPaymentLink };