# AlertPulse — AI-Native Hospital Alarm Triage

> **DEMO ONLY — NOT FOR CLINICAL USE.** Prototype only: simulated
> alarms, no live hospital feed, no EMR connection, not FDA cleared,
> not HIPAA-ready, billing not live. See README.md.

## What this app does

AlertPulse is a demo/prototype of hospital alarm triage: it classifies
(simulated) alarms as actionable or suppressible and surfaces true
signals for attention. The core product is the alarm triage agent that
provides transparent reasoning for every classification. It must never
be used for real ICU triage.

## Stack

Express.js + EJS + Neon PostgreSQL + Render (single service)

## Directory map

- `server.js` — Entry point, wires middleware and routes, runs migrations on boot
- `migrate.js` — Migration runner (`.js` and `.sql` files in `migrations/`); also creates core `users` table
- `migrations/` — SQL migration files, applied in filename order by migrate.js (0001 alarms, 0002 clients, 0003 leads, 0004 patent, 0005 payment links). These now exist — earlier the folder was missing from the zip and only `users`/`_migrations` were created.
- `.env.example` — Every env var the code reads, placeholder values only
- `routes/alarms.js` — Alarm ingestion (`/api/alarms/ingest`), feed (`/stream`, `/recent`, `/actionable`), stats, FHIR export (`GET /api/alarms/:id/fhir`)
- `routes/admin.js` — Admin control panel API: hospitals CRUD, alarm config, invoices, billing. All endpoints require `x-admin-secret` header matching `ADMIN_SECRET` env var
- `routes/cold-email.js` — Cold email: leads CRUD, campaigns, Hunter.io verification, sends. Auth via `x-admin-secret`
- `routes/patent.js` — Patent tracking: cases, reminders, attorneys, prior art. Auth via `x-admin-secret`
- `db/alarms.js` — All queries for alarm_events and triage_decisions tables (incl. getAlarmEventById for FHIR export)
- `db/clients.js` — All queries for hospitals, hospital_alarm_config, invoices tables
- `db/leads.js` — All queries for cold_email_leads, cold_email_campaigns, cold_email_sends tables
- `db/patent.js` — All queries for patent_cases, patent_attorneys, patent_reminders, prior_art_references tables
- `db/index.js` — Pool singleton (only file that creates `new Pool()`)
- `services/triage-engine.js` — Rule-based alarm classifier (16 rules from documents/patent-provisional-2026.md, dispatch/suppress/monitor); safety override: critical values always dispatch, never suppress. Exports RULES and classify().
- `services/alarm-simulator.js` — Generates simulated ICU alarm stream (vitals, device, medication events) — DEMO ONLY, no real monitor feed
- `services/stream-controller.js` — Manages the background alarm stream loop and in-memory ring buffer
- `services/cold-email.js` — Cold email sending: Hunter.io verification, SMTP or company_email dispatch, campaign processing
- `lib/polsia-ai.js` — Polsia AI proxy client (do not call model APIs directly)
- `lib/fhir.js` — FHIR R4 Observation export (toObservation); stub/export only, no EMR connection
- `lib/stripe-payments.js` — Queues Stripe payment link requests (DEMO ONLY: no real Stripe link is created, billing is not live)
- `test/triage.test.js` — Triage engine unit tests (node:test); run with `node --test test/triage.test.js`
- `views/dashboard.ejs` — Real-time triage dashboard (filterable feed, stats, suppression breakdown) with a DEMO ONLY banner
- `views/admin.ejs` — Admin control panel: client/hospital management, alarm config, invoices, billing (client-side auth via `x-admin-secret`)
- `views/layout.ejs` — Landing page EJS shell
- `views/partials/` — Landing page section partials
- `public/css/theme.css` — Landing page styles (Sora + Plus Jakarta Sans, warm palette)
- `jobs/patent-reminder.js` — Patent reminder cron job; triggered weekly via polsia.toml [[crons]]
- `documents/` — Patent spec and research documents (provisional spec, prior art search, attorney directory)

## Database

- `alarm_events` — Raw signal data: event_type, source, param, value, unit, severity, raw_context
- `triage_decisions` — AI output per alarm: action, confidence, priority_score, reason, rule_applied, suppression_category
- `hospitals` — Client/hospital records: name, icu_count, contact info, tier (basic/premium), status (lead/pilot/active/churned), monthly_rate_cents
- `hospital_alarm_config` — Per-hospital alarm thresholds and suppression rules (key/value pairs)
- `invoices` — Billing invoices: hospital_id, amount_cents, status (pending/paid/overdue), period, due_date, stripe_checkout_url
- `payment_link_requests` — Queued Stripe payment link generation (DEMO ONLY: no real link is created, billing is not live)
- `cold_email_leads` — Cold outreach leads: email, company, title, verification status, outreach status
- `cold_email_campaigns` — Campaign records: subject, body_template, send stats (opens, clicks, bounces, replies)
- `cold_email_sends` — Per-campaign-per-lead send queue: status, sent_at, error_message
- `patent_cases` — Patent tracking: case_name, filing_date, expiry_date, case_type (provisional/non-provisional), status, application_number, notes
- `patent_attorneys` — Attorney directory: name, firm, specialty (ICU/medical device), rating, contact info
- `patent_reminders` — Reminder schedule: patent_case_id, reminder_date, reminder_type, title, status (pending/sent/completed)
- `prior_art_references` — Prior art search results: source (USPTO/Google/WIPO), reference_type, title, url, relevance_score
- `users` — Created by core migrations (email, subscription fields synced by Polsia)
- `_migrations` — Tracks applied migrations

## External integrations

- Polsia AI proxy — Alarm classification (via lib/polsia-ai.js)
- Polsia Stripe (polsia_payments MCP) — Payment link creation for invoice billing (agent-driven, server queues requests; DEMO ONLY — no real link is created, billing is not live)
- Polsia company_email MCP — Cold email sending via alertpulse@polsia.app (2/day cold rate limit); patent reminder emails
- Hunter.io — Email verification before sending (protects sender reputation). Set HUNTER_API_KEY env var.
- Neon PostgreSQL — All persistent data
- Render — Single web service deployment

## Recent changes

- 2026-11-05: Demo-only completion pass — created migrations/ (0001–0005, all tables the code queries; previously missing from the zip), rewrote services/triage-engine.js to the full 16-rule library from the patent doc with a critical-value safety override, added lib/fhir.js + GET /api/alarms/:id/fhir (export only, no EMR connection), added test/triage.test.js and .env.example, added DEMO ONLY banners/notes to README and the dashboard, and made the Stripe placeholder explicit (no real link, billing not live). Still NOT ready for real ICU use — see README "What real ICU deployment would still require".
- 2026-06-12: Patent tracking system — /api/patent/* routes, 4 new DB tables (patent_cases, patent_attorneys, patent_reminders, prior_art_references), migration 0005 + 0006 seed; prior art research doc + attorney directory in documents/
- 2026-06-09: Cold email infrastructure — leads table, campaign management, Hunter.io verification, SMTP/custom domain ready (set SMTP_* env vars for dedicated sending domain)
- 2026-06-04: Built Admin Dashboard — hospital/client management at /admin (CRUD, status, tier, alarm config per hospital), invoices and billing (manual generation, Stripe payment links via Polsia agent, status tracking), 5 new DB tables via migration 0003
- 2026-05-28: Stream starts on server boot (not lazy). Fixes null constraint on priority_score for suppress/monitor rules. Alarm feed fully operational at /dashboard with 225+ events processed.
- 2026-05-28: Built Alarm Triage Agent MVP — alarm events table, triage decisions table, clinical rule classifier, alarm simulator, triage dashboard at /dashboard, API feed at /api/alarms/*