/**
 * test/triage.test.js — Triage engine tests (node:test + node:assert).
 * DEMO ONLY — these tests check the prototype rule engine's behaviour
 * on simulated inputs. They do not validate clinical safety.
 *
 * Run: node --test test/triage.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const { classify, RULES } = require('../services/triage-engine');

const EXPECTED_RULES = [
  'ARTIFACT_HR_DROP',
  'ARTIFACT_SPO2_DROP',
  'ARTIFACT_BP_SPIKE',
  'DUPLICATE_MULTI_PARAM',
  'DUPLICATE_CROSS_PARAM',
  'MED_ADJACENCY_OPIOID',
  'MED_ADJACENCY_SEDATION',
  'SUSTAINED_THRESHOLD_HR',
  'SUSTAINED_THRESHOLD_SPO2',
  'SUSTAINED_THRESHOLD_BP',
  'MONITOR_BORDERLINE_HR',
  'MONITOR_BORDERLINE_SPO2',
  'VENT_ALARM_MATCHED',
  'NO_RESP_RATE_CONTACT',
  'NIBP_CUFF_CONFOUND',
  'CTX_SWITCH_OVERSENSITIVE',
];

test('all 16 patent rules are present', () => {
  const names = RULES.map((r) => r.name);
  assert.strictEqual(names.length, 16, `expected 16 rules, got ${names.length}: ${names.join(', ')}`);
  for (const name of EXPECTED_RULES) assert.ok(names.includes(name), `missing rule ${name}`);
  for (const rule of RULES) {
    assert.ok(['dispatch', 'suppress', 'monitor'].includes(rule.action), `${rule.name}: bad action`);
    assert.ok(typeof rule.match === 'function', `${rule.name}: no match()`);
  }
});

test('critical SpO2 < 85 dispatches', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'SpO2', value: '80', unit: '%' });
  assert.strictEqual(d.action, 'dispatch');
});

test('critical HR >= 160 dispatches', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'HR', value: '170', unit: 'bpm' });
  assert.strictEqual(d.action, 'dispatch');
});

test('critical HR < 40 dispatches (never suppressed as artifact)', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'HR', value: '35', unit: 'bpm', rawContext: { durationSeconds: 5 } });
  assert.strictEqual(d.action, 'dispatch');
});

test('critical systolic BP < 80 dispatches', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'BP-sys', value: '70', unit: 'mmHg' });
  assert.strictEqual(d.action, 'dispatch');
});

test('critical systolic BP >= 180 dispatches', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'BP-sys', value: '190', unit: 'mmHg' });
  assert.strictEqual(d.action, 'dispatch');
});

test('apnea dispatches', () => {
  const d = classify({ eventType: 'device', source: 'Monitor A', param: 'apnea', value: '15s no respiration', unit: '' });
  assert.strictEqual(d.action, 'dispatch');
  assert.strictEqual(d.rule_applied, 'NO_RESP_RATE_CONTACT');
});

test('lead-off suppresses', () => {
  const d = classify({ eventType: 'device', source: 'Monitor A', param: 'lead-off', value: 'displaced', unit: '' });
  assert.strictEqual(d.action, 'suppress');
  assert.match(d.reason, /Lead-off/);
});

test('borderline HR monitors', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'HR', value: '140', unit: 'bpm' });
  assert.strictEqual(d.action, 'monitor');
  assert.strictEqual(d.rule_applied, 'MONITOR_BORDERLINE_HR');
});

test('borderline SpO2 monitors', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'SpO2', value: '90', unit: '%' });
  assert.strictEqual(d.action, 'monitor');
  assert.strictEqual(d.rule_applied, 'MONITOR_BORDERLINE_SPO2');
});

test('opioid-adjacent SpO2 90 suppresses', () => {
  const d = classify({
    eventType: 'vitals', source: 'ICU Bay 1', param: 'SpO2', value: '90', unit: '%',
    rawContext: { medication: 'Fentanyl 50 mcg IV', minutesSinceMedication: 10 },
  });
  assert.strictEqual(d.action, 'suppress');
  assert.strictEqual(d.rule_applied, 'MED_ADJACENCY_OPIOID');
});

test('every decision carries the required fields', () => {
  const d = classify({ eventType: 'vitals', source: 'ICU Bay 1', param: 'Temp', value: '37.1', unit: '°C' });
  for (const k of ['action', 'confidence', 'priority_score', 'reason', 'rule_applied', 'suppression_category']) {
    assert.ok(k in d, `missing ${k}`);
  }
});
