# AlertPulse — AI-Native Hospital Alarm Triage (Demo)

> **DEMO ONLY — NOT FOR CLINICAL USE.**
> AlertPulse is a prototype / demo. It is **not a medical device**,
> **not FDA cleared**, **not HIPAA-ready**, and must **never** be used
> to triage real ICU alarms or make clinical decisions. All alarm data
> in the demo is simulated (see `services/alarm-simulator.js`) or
> manually ingested for testing. There is no live hospital feed, no
> EMR connection, and billing is not live.

## What it is

AlertPulse is an Express + EJS + PostgreSQL web app that demonstrates
ICU alarm triage: a rule-based classifier (`services/triage-engine.js`,
16 rules) labels each alarm **dispatch / suppress / monitor**, with a
reason, confidence, and priority score, and surfaces it on a live
dashboard.

- **Dashboard** — `/dashboard` (simulated feed, stats)
- **Admin panel** — `/admin` (hospitals, alarm config, invoices)
- **Alarm API** — `/api/alarms/*` (ingest, stream, recent, actionable, stats, FHIR export)
- **Cold email** — `/api/cold-email/*` (leads, campaigns, sends)
- **Patent tracking** — `/api/patent/*` (cases, reminders, attorneys, prior art)
- **Landing page** — `/` (`views/layout.ejs` + `views/partials/`)

## Requirements

- Node.js 20+
- PostgreSQL database (e.g. Neon, or local Postgres)

## How to run locally

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and ADMIN_SECRET at minimum
npm run migrate        # creates all tables (see migrations/)
npm start              # serves on http://localhost:3000 (or $PORT)
```

`npm run build` runs the migrations on deploy (Render, see `render.yaml`).
Migrations live in `migrations/` and are applied in filename order by
`migrate.js`, tracked in the `_migrations` table. They are idempotent
(`CREATE TABLE IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`),
so `npm run migrate` can be re-run safely. `migrate.js` also creates
the core `users` table. `server.js` only creates the `_migrations`
table on boot — the rest comes from `migrations/`.

## Environment variables

See `.env.example` for the full list with placeholder values only.
The code reads: `DATABASE_URL`, `PORT`, `ADMIN_SECRET`, `ADMIN_EMAIL`,
`APP_URL`, `POLSIA_API_KEY`, `POLSIA_API_URL`, `POLSIA_SUBSCRIPTION_ID`,
`POLSIA_ANALYTICS_SLUG`, `HUNTER_API_KEY`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`,
`EMAIL_BATCH_SIZE`. Never put real secrets in chat or in git.

## Endpoints

- `GET /` — Landing page
- `GET /health` and `GET /api/health` — Health check
- `GET /dashboard` — Triage dashboard (demo banner on the page)
- `GET /admin` — Admin control panel (needs `ADMIN_SECRET`)
- `GET /api/alarms/stream` — Live simulated feed (in-memory ring buffer)
- `GET /api/alarms/recent?limit=50` — Last alarms with triage decisions
- `GET /api/alarms/actionable?limit=30` — Dispatch-ranked alarms
- `GET /api/alarms/stats` — Counts (total / dispatched / suppressed)
- `POST /api/alarms/ingest` — Ingest one alarm (JSON: `eventType`, `source`, `param`, `value`, optional `unit`, `severity`, `rawContext`)
- `GET /api/alarms/:id/fhir` — FHIR R4 Observation export for one stored alarm (404 if missing). Export only — no EMR connection.
- `GET/POST/PUT/DELETE /api/admin/hospitals…`, `/api/admin/invoices…` — Admin API, all require `x-admin-secret` header (or `admin_secret` query param)
- `GET/POST /api/cold-email/*` and `/api/patent/*` — see `routes/cold-email.js` and `routes/patent.js`

## How to test ingest

```bash
curl -X POST http://localhost:3000/api/alarms/ingest \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"vitals","source":"ICU Bay 1","param":"SpO2","value":"82","unit":"%","severity":"high"}'

# Then export the stored alarm as FHIR (replace 1 with the returned event id):
curl http://localhost:3000/api/alarms/1/fhir

# Run the triage unit tests (no database needed):
node --test test/triage.test.js
```

Context for the context-sensitive rules (medication, duplicates,
shift change, cuff, vent procedure, drop/duration) can be passed in
`rawContext`, e.g. `{"medication":"Fentanyl 50 mcg IV","minutesSinceMedication":10}`.
Without that context those rules do not fire — the engine never
invents patient data.

## What real ICU deployment would still require

None of the following is done in this repo. Do not claim otherwise.

- **FDA clearance / registration** as a medical device (SaMD), with a
  quality management system and regulatory review.
- **Clinical validation** — prospective studies, clinician feedback,
  and validation of the rule thresholds on real (not simulated) data.
  The 16 rules here are a prototype library, not clinically validated.
- **HIPAA readiness** — Business Associate Agreements, encryption
  at rest/in transit, access controls, audit logging, and de-identification
  of any patient data. This demo stores no real patient data and has
  none of those controls in place.
- **Real HL7 / FHIR feed integration** with hospital monitors and
  EMRs, with sustained-time verification (the demo's sustained rules
  are best-effort single-event checks — see `services/triage-engine.js`).
- **Hospital IT / security review**, penetration testing, and
  clinician oversight / human-in-the-loop sign-off for any dispatch.
- **Live billing** — Stripe payment links are placeholders in this
  demo (`lib/stripe-payments.js`); no real Stripe link is created.

## Layout

```
views/
  layout.ejs           top-level template (entry point)
  dashboard.ejs        triage dashboard (with DEMO ONLY banner)
  admin.ejs            admin control panel
  partials/            landing-page sections included from layout
public/
  css/                 stylesheets, served at /css/<file>
lib/
  landing-context.js   builds the render context
  polsia-ai.js         Polsia AI proxy client (optional AI classification)
  fhir.js              FHIR R4 Observation export (stub, no EMR connection)
  stripe-payments.js   queues payment-link requests (DEMO: no real Stripe link)
migrations/
  0001_alarms.sql      alarm_events, triage_decisions
  0002_clients.sql     hospitals, hospital_alarm_config, invoices
  0003_leads.sql       cold_email_leads, cold_email_campaigns, cold_email_sends
  0004_patent.sql      patent_cases, patent_attorneys, patent_reminders, prior_art_references
  0005_payment_links.sql  payment_link_requests
server.js              Express app
migrate.js             migration runner (run via `npm run migrate`)
test/
  triage.test.js       triage engine unit tests (node:test)
```

## Deployment

Configured for Render via `render.yaml`. `npm run build` runs migrations on
deploy.
