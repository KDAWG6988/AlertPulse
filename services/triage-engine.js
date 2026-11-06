/**
 * services/triage-engine.js — Alarm classification logic.
 *
 * DEMO ONLY — NOT FOR CLINICAL USE. This is a prototype rule engine
 * operating on simulated / manually-ingested alarm events. It is not a
 * medical device, is not FDA cleared, and must never be used to make
 * real ICU triage decisions. See README.md.
 *
 * Classifies alarms as dispatch/suppress/monitor using the 16-rule
 * clinical library documented in documents/patent-provisional-2026.md.
 * Each rule has a `match(alarm)` predicate and a static/dynamic reason.
 *
 * Fields actually available on an alarm (no patient data is invented):
 *   eventType, source, param, value, unit, severity, rawContext
 * rawContext — when the ingesting system provides it — may carry
 * duration / medication / procedure / duplicate / shift-change context,
 * e.g. { durationSeconds, dropPercent, medication, minutesSinceMedication,
 * procedure, duplicateCount, shiftChangeWithinMinutes, cuffInflationSecondsAgo }.
 * Rules that need that context do NOT fire when it is absent.
 *
 * Sustained-time rules: a real monitor feed would confirm a value over
 * time (e.g. HR > 150 sustained > 60s). This demo only ever sees a
 * single event at a time, so sustained rules are implemented as a
 * best-effort single-event check (see SUSTAINED_THRESHOLD_* matches):
 * a value in the sustained range dispatches now rather than waiting
 * for history this demo does not have. That is a deliberate
 * fail-towards-dispatch choice, not a claim of sustained verification.
 *
 * SAFETY OVERRIDE (checked before any rule, in classify()):
 *   SpO2 < 85, HR >= 160 or HR < 40, systolic BP < 80 or >= 180,
 *   or any apnea / no-respiration event MUST dispatch — never suppress.
 * This means the artifact rules that name those same values
 * (ARTIFACT_HR_DROP, ARTIFACT_BP_SPIKE) can never suppress a critical
 * value in classify(); they are kept in RULES for completeness/audit
 * and only fire for non-critical artifact evidence (e.g. a lead-off
 * electrode displacement, which is a classic signal artifact).
 */

function num(a) {
  const v = parseFloat(a && a.value);
  return Number.isFinite(v) ? v : null;
}

// rawContext may be an object, a JSON string (as stored in the DB), or null.
// Also accept the same fields passed top-level on the alarm object.
function ctx(a) {
  const out = {};
  if (a && typeof a.rawContext === 'object' && a.rawContext !== null) Object.assign(out, a.rawContext);
  else if (a && typeof a.rawContext === 'string') {
    try { Object.assign(out, JSON.parse(a.rawContext)); } catch { /* ignore malformed context */ }
  }
  if (a) {
    for (const k of ['durationSeconds', 'duration_seconds', 'sustainedSeconds', 'sustained_seconds',
      'dropPercent', 'drop_percent', 'medication', 'medicationName', 'minutesSinceMedication',
      'minutes_since_medication', 'procedure', 'duplicateCount', 'alarmsWithin30s',
      'alarmsWithin60s', 'crossParam', 'respiratoryDistress', 'shiftChangeWithinMinutes',
      'shiftChange', 'cuffInflationSecondsAgo', 'nibpCuff', 'artifactSuspected']) {
      if (a[k] !== undefined) out[k] = a[k];
    }
  }
  return out;
}

function ctxNum(c, ...keys) {
  for (const k of keys) {
    const v = parseFloat(c[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function medName(c) {
  const m = c.medication || c.medicationName || '';
  return String(m).toLowerCase();
}

function isOpioid(c) {
  const m = medName(c);
  return /opioid|fentanyl|morphine|oxycodone|hydromorphone|codeine|tramadol/.test(m);
}

function isSedative(c) {
  const m = medName(c);
  return /midazolam|propofol/.test(m);
}

// BP value: the code uses param 'BP-sys'; the patent doc talks about MAP.
// Treat 'BP-sys', 'MAP' and 'BP' the same here — the value is what we have.
function bpValue(a) {
  if (['BP-sys', 'MAP', 'BP', 'BP_sys'].includes(a.param)) return num(a);
  return null;
}

const RULES = [
  // ── 1. ARTIFACT_HR_DROP — suppress ──────────────────────────
  // Patent: HR < 40 bpm lasting < 10s, not confirmed.
  // Safety override means a numeric HR < 40 never reaches this rule in
  // classify(). The rule also covers a lead-off event (electrode
  // displacement): a classic signal artifact, not a patient change.
  {
    name: 'ARTIFACT_HR_DROP',
    action: 'suppress', confidence: 88, priority_score: 500, suppression_category: 'signal_artifact',
    reasonTpl: (a) => (a.param === 'lead-off'
      ? 'Lead-off alert — electrode displacement, not a patient condition change'
      : 'HR drop with no corroborating vitals change — likely signal artifact'),
    match: (a) => {
      if (a.param === 'lead-off' && a.eventType === 'device') return true;
      const c = ctx(a);
      const v = num(a);
      const dur = ctxNum(c, 'durationSeconds', 'duration_seconds');
      return a.param === 'HR' && v !== null && v < 40 && dur !== null && dur < 10;
    },
  },
  // ── 2. ARTIFACT_SPO2_DROP — suppress ────────────────────────
  // Patent: SpO2 drop > 10% in < 5s, no sustained threshold breach.
  {
    name: 'ARTIFACT_SPO2_DROP',
    action: 'suppress', confidence: 87, priority_score: 500, suppression_category: 'signal_artifact',
    reasonStatic: 'SpO2 drop > 10% in under 5 seconds with no sustained breach — likely motion artifact',
    match: (a) => {
      const c = ctx(a);
      const drop = ctxNum(c, 'dropPercent', 'drop_percent');
      const dur = ctxNum(c, 'durationSeconds', 'duration_seconds');
      return a.param === 'SpO2' && drop !== null && drop > 10 && dur !== null && dur < 5;
    },
  },
  // ── 3. ARTIFACT_BP_SPIKE — suppress ─────────────────────────
  // Patent: MAP spike > 200 mmHg lasting < 8s, no organ-damage context.
  // Safety override means a BP >= 180 never reaches this rule in classify().
  {
    name: 'ARTIFACT_BP_SPIKE',
    action: 'suppress', confidence: 86, priority_score: 500, suppression_category: 'signal_artifact',
    reasonStatic: 'BP spike lasting under 8 seconds — likely transient artifact',
    match: (a) => {
      const c = ctx(a);
      const v = bpValue(a);
      const dur = ctxNum(c, 'durationSeconds', 'duration_seconds');
      return v !== null && v > 200 && dur !== null && dur < 8;
    },
  },
  // ── 4. DUPLICATE_MULTI_PARAM — suppress ─────────────────────
  // Patent: >= 2 alarms from same patient within 30s, same parameter family.
  {
    name: 'DUPLICATE_MULTI_PARAM',
    action: 'suppress', confidence: 90, priority_score: 500, suppression_category: 'duplicate',
    reasonStatic: 'Duplicate alarm from same patient within 30 seconds — same parameter family',
    match: (a) => {
      const c = ctx(a);
      const n = ctxNum(c, 'duplicateCount', 'alarmsWithin30s');
      return (n !== null && n >= 2) || c.isDuplicate === true;
    },
  },
  // ── 5. DUPLICATE_CROSS_PARAM — suppress ─────────────────────
  // Patent: SpO2 + HR alarms from same patient within 60s.
  {
    name: 'DUPLICATE_CROSS_PARAM',
    action: 'suppress', confidence: 89, priority_score: 500, suppression_category: 'duplicate',
    reasonStatic: 'SpO2 + HR alarms from same patient within 60 seconds — cross-parameter duplicate',
    match: (a) => {
      const c = ctx(a);
      const n = ctxNum(c, 'alarmsWithin60s');
      return c.crossParam === true || c.duplicateCrossParam === true || (n !== null && n >= 2 && c.crossParam !== false && (a.param === 'SpO2' || a.param === 'HR'));
    },
  },
  // ── 6. MED_ADJACENCY_OPIOID — suppress ─────────────────────
  // Patent: SpO2 <= 92 within 15 min of opioid administration,
  // no respiratory distress signs.
  {
    name: 'MED_ADJACENCY_OPIOID',
    action: 'suppress', confidence: 85, priority_score: 500, suppression_category: 'medication_related',
    reasonStatic: 'SpO2 <= 92 within 15 minutes of opioid administration, no respiratory distress — medication-adjacent',
    match: (a) => {
      const c = ctx(a);
      const v = num(a);
      const mins = ctxNum(c, 'minutesSinceMedication', 'minutes_since_medication');
      return a.param === 'SpO2' && v !== null && v <= 92 && isOpioid(c) && mins !== null && mins <= 15 && c.respiratoryDistress !== true;
    },
  },
  // ── 7. MED_ADJACENCY_SEDATION — suppress ────────────────────
  // Patent: RR alarm within 30 min of midazolam/propofol bolus, stable context.
  {
    name: 'MED_ADJACENCY_SEDATION',
    action: 'suppress', confidence: 84, priority_score: 500, suppression_category: 'medication_related',
    reasonStatic: 'RR alarm within 30 minutes of midazolam/propofol — sedation-adjacent, stable context',
    match: (a) => {
      const c = ctx(a);
      const mins = ctxNum(c, 'minutesSinceMedication', 'minutes_since_medication');
      return a.param === 'RR' && isSedative(c) && mins !== null && mins <= 30;
    },
  },
  // ── 8. SUSTAINED_THRESHOLD_HR — dispatch ────────────────────
  // Patent: HR > 150 or < 40 sustained > 60s, not medication-adjacent.
  // Best-effort single-event check: without duration history this demo
  // dispatches on the value alone (see header). HR < 40 is also caught
  // by the safety override before this rule is reached.
  {
    name: 'SUSTAINED_THRESHOLD_HR',
    action: 'dispatch', confidence: 97, priority_score: 980, suppression_category: null,
    reasonTpl: (a) => `HR ${a.value} bpm — above/below sustained intervention threshold`,
    match: (a) => {
      const v = num(a);
      return a.param === 'HR' && v !== null && (v > 150 || v < 40);
    },
  },
  // ── 9. SUSTAINED_THRESHOLD_SPO2 — dispatch ──────────────────
  // Patent: SpO2 <= 88 sustained > 30s. Best-effort single-event check.
  {
    name: 'SUSTAINED_THRESHOLD_SPO2',
    action: 'dispatch', confidence: 99, priority_score: 995, suppression_category: null,
    reasonTpl: (a) => `SpO2 ${a.value}% — sustained threshold breach, immediate intervention`,
    match: (a) => {
      const v = num(a);
      return a.param === 'SpO2' && v !== null && v <= 88;
    },
  },
  // ── 10. SUSTAINED_THRESHOLD_BP — dispatch ───────────────────
  // Patent: MAP < 55 or > 180 sustained > 45s. Best-effort single-event
  // check, using the BP value available (BP-sys / MAP).
  {
    name: 'SUSTAINED_THRESHOLD_BP',
    action: 'dispatch', confidence: 98, priority_score: 970, suppression_category: null,
    reasonTpl: (a) => `BP ${a.value} mmHg — sustained threshold breach`,
    match: (a) => {
      const v = bpValue(a);
      return v !== null && (v < 55 || v > 180);
    },
  },
  // ── 11. MONITOR_BORDERLINE_HR — monitor ─────────────────────
  // Patent: HR 130–150 or 40–50 sustained 20–45s — not actionable yet.
  {
    name: 'MONITOR_BORDERLINE_HR',
    action: 'monitor', confidence: 76, priority_score: 500, suppression_category: null,
    reasonStatic: 'HR in borderline range 130–150 or 40–50 — monitoring for trend confirmation',
    match: (a) => {
      const v = num(a);
      return a.param === 'HR' && v !== null && ((v >= 130 && v <= 150) || (v >= 40 && v <= 50));
    },
  },
  // ── 12. MONITOR_BORDERLINE_SPO2 — monitor ───────────────────
  // Patent: SpO2 88–92 sustained 15–30s.
  {
    name: 'MONITOR_BORDERLINE_SPO2',
    action: 'monitor', confidence: 76, priority_score: 500, suppression_category: null,
    reasonStatic: 'SpO2 in watch range 88–92 — monitoring for trend confirmation',
    match: (a) => {
      const v = num(a);
      return a.param === 'SpO2' && v !== null && v >= 88 && v <= 92;
    },
  },
  // ── 13. VENT_ALARM_MATCHED — suppress ───────────────────────
  // Patent: vent alarm correlated with scheduled suction / routine care.
  {
    name: 'VENT_ALARM_MATCHED',
    action: 'suppress', confidence: 88, priority_score: 500, suppression_category: 'procedure_related',
    reasonStatic: 'Ventilator alarm correlated with scheduled suction or routine care — procedure-adjacent',
    match: (a) => {
      const c = ctx(a);
      const proc = String(c.procedure || '').toLowerCase();
      const hay = `${a.param} ${a.source} ${a.value}`.toLowerCase();
      const isVent = /vent/.test(hay);
      return isVent && (/suction|routine care|scheduled/.test(proc) || /suction/.test(hay));
    },
  },
  // ── 14. NO_RESP_RATE_CONTACT — dispatch ─────────────────────
  // Patent: apnea alarm (RR = 0) > 15s with no recent opioid.
  // Apnea is also caught by the safety override before this rule.
  {
    name: 'NO_RESP_RATE_CONTACT',
    action: 'dispatch', confidence: 98, priority_score: 990, suppression_category: null,
    reasonTpl: () => 'Apnea alarm — no respiration detected for > 15 seconds',
    match: (a) => {
      const c = ctx(a);
      const v = num(a);
      const isApnea = a.param === 'apnea' || (a.param === 'RR' && v === 0) || /no respiration|apnea/.test(String(a.value).toLowerCase());
      const mins = ctxNum(c, 'minutesSinceMedication', 'minutes_since_medication');
      return isApnea && !(isOpioid(c) && mins !== null && mins <= 15);
    },
  },
  // ── 15. NIBP_CUFF_CONFOUND — suppress ───────────────────────
  // Patent: MAP spike within 60s of NIBP cuff inflation cycle.
  {
    name: 'NIBP_CUFF_CONFOUND',
    action: 'suppress', confidence: 87, priority_score: 500, suppression_category: 'device_noise',
    reasonStatic: 'BP spike within 60 seconds of NIBP cuff inflation — equipment confound',
    match: (a) => {
      const c = ctx(a);
      const v = bpValue(a);
      const secs = ctxNum(c, 'cuffInflationSecondsAgo');
      return v !== null && (secs !== null && secs <= 60 || c.nibpCuff === true);
    },
  },
  // ── 16. CTX_SWITCH_OVERSENSITIVE — monitor ──────────────────
  // Patent: multiple alarms within 5 min of attending shift change.
  {
    name: 'CTX_SWITCH_OVERSENSITIVE',
    action: 'monitor', confidence: 70, priority_score: 500, suppression_category: null,
    reasonStatic: 'Multiple alarms near shift change — handoff artifact, monitoring',
    match: (a) => {
      const c = ctx(a);
      const mins = ctxNum(c, 'shiftChangeWithinMinutes');
      return c.shiftChange === true || (mins !== null && mins <= 5);
    },
  },
];

const RULE_BY_NAME = Object.fromEntries(RULES.map((r) => [r.name, r]));

// Priority order for classify(): dispatch rules first, then context
// suppressions, then artifact suppressions, then monitors. This is NOT
// the patent-document order — it ensures a critical / sustained value
// is never suppressed by a context or artifact rule.
const PRIORITY = [
  'SUSTAINED_THRESHOLD_HR',
  'SUSTAINED_THRESHOLD_SPO2',
  'SUSTAINED_THRESHOLD_BP',
  'NO_RESP_RATE_CONTACT',
  'MED_ADJACENCY_OPIOID',
  'MED_ADJACENCY_SEDATION',
  'VENT_ALARM_MATCHED',
  'NIBP_CUFF_CONFOUND',
  'DUPLICATE_MULTI_PARAM',
  'DUPLICATE_CROSS_PARAM',
  'ARTIFACT_SPO2_DROP',
  'ARTIFACT_BP_SPIKE',
  'ARTIFACT_HR_DROP',
  'MONITOR_BORDERLINE_HR',
  'MONITOR_BORDERLINE_SPO2',
  'CTX_SWITCH_OVERSENSITIVE',
];

function isApnea(a) {
  const v = num(a);
  return a.param === 'apnea' || (a.param === 'RR' && v === 0) || /no respiration|apnea/.test(String(a.value || '').toLowerCase());
}

function decisionFrom(rule, alarm) {
  return {
    action: rule.action,
    confidence: rule.confidence,
    priority_score: rule.priority_score || 500,
    suppression_category: rule.suppression_category || null,
    reason: rule.reasonTpl ? rule.reasonTpl(alarm) : rule.reasonStatic,
    rule_applied: rule.name,
    alarm_event_id: alarm.id,
  };
}

function classify(alarm) {
  const a = alarm || {};
  const v = num(a);
  const bp = bpValue(a);

  // ── SAFETY OVERRIDE: critical values always dispatch, never suppress.
  // Map to the corresponding sustained/apnea rule so rule_applied stays
  // a real rule name from the 16-rule library.
  if (isApnea(a)) return decisionFrom(RULE_BY_NAME.NO_RESP_RATE_CONTACT, a);
  if (a.param === 'SpO2' && v !== null && v < 85) return decisionFrom(RULE_BY_NAME.SUSTAINED_THRESHOLD_SPO2, a);
  if (a.param === 'HR' && v !== null && (v >= 160 || v < 40)) return decisionFrom(RULE_BY_NAME.SUSTAINED_THRESHOLD_HR, a);
  if (bp !== null && (bp < 80 || bp >= 180)) return decisionFrom(RULE_BY_NAME.SUSTAINED_THRESHOLD_BP, a);

  for (const name of PRIORITY) {
    const rule = RULE_BY_NAME[name];
    if (rule && rule.match(a)) return decisionFrom(rule, a);
  }

  return {
    action: 'monitor',
    confidence: 60,
    priority_score: 500,
    reason: 'Edge-case alarm — monitoring for additional signal confirmation',
    rule_applied: 'default',
    suppression_category: null,
    alarm_event_id: a.id,
  };
}

module.exports = { classify, RULES };
