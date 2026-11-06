/**
 * services/alarm-simulator.js — Generates realistic hospital alarm events.
 *
 * Produces a stream of vitals, device, and medication events that reflect
 * real ICU patterns: many suppressible, some actionable, occasional critical.
 *
 * Call `.tick()` to get the next batch of events (1-4 per tick, 2-4 second intervals).
 */

const SOURCES = ['ICU Bay 1', 'ICU Bay 2', 'ICU Bay 3', 'ICU Bay 4', 'ICU Bay 5', 'Step-down Bay 2'];
const DEVICE_SOURCES = ['Monitor A', 'Monitor B', 'Pump 3', 'Pump 7', 'Ventilator 2'];

// Base vitals for each bay (patients have slightly different baselines)
const BAY_BASELINES = {
  'ICU Bay 1': { HR: 78, SpO2: 97, RR: 16, Temp: 37.1, BP_sys: 118 },
  'ICU Bay 2': { HR: 92, SpO2: 94, RR: 19, Temp: 37.4, BP_sys: 128 },
  'ICU Bay 3': { HR: 71, SpO2: 98, RR: 14, Temp: 36.8, BP_sys: 112 },
  'ICU Bay 4': { HR: 88, SpO2: 95, RR: 18, Temp: 37.2, BP_sys: 135 },
  'ICU Bay 5': { HR: 105, SpO2: 92, RR: 22, Temp: 37.8, BP_sys: 108 },
  'Step-down Bay 2': { HR: 74, SpO2: 98, RR: 15, Temp: 36.9, BP_sys: 122 },
};

// State machine for each bay
const bayStates = {};
for (const bay of SOURCES) {
  bayStates[bay] = {
    onPropofol: bay === 'ICU Bay 3',
    lastHR: BAY_BASELINES[bay].HR,
    lastSpO2: BAY_BASELINES[bay].SpO2,
  };
}

/**
 * Returns a random element from an array.
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a gaussian-random number around mean with given std dev.
 */
function gaussian(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Generates a batch of alarm events.
 * Call this every ~3 seconds from the stream controller.
 */
function tick() {
  const events = [];
  const count = Math.random() < 0.4 ? 1 : Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < count; i++) {
    const eventType = pick(['vitals', 'vitals', 'vitals', 'device', 'medication']);

    if (eventType === 'vitals') {
      events.push(generateVitalsEvent());
    } else if (eventType === 'device') {
      events.push(generateDeviceEvent());
    } else {
      events.push(generateMedicationEvent());
    }
  }

  return events;
}

function generateVitalsEvent() {
  const bay = pick(SOURCES);
  const state = bayStates[bay];
  const base = BAY_BASELINES[bay];

  // Pick which parameter triggered the alarm
  const param = pick(['HR', 'HR', 'SpO2', 'SpO2', 'RR', 'Temp', 'BP-sys']);

  let value, unit, severity;

  if (param === 'HR') {
    // Usually normal-ish with occasional spikes
    const spike = Math.random() < 0.15;
    value = spike ? Math.round(gaussian(spike ? 155 : 90, 20)) : Math.round(gaussian(base.HR, 8));
    value = Math.max(50, Math.min(200, value));
    unit = 'bpm';
    severity = value > 160 ? 'high' : value > 130 ? 'medium' : 'low';
  } else if (param === 'SpO2') {
    // Typically normal with occasional dips
    const dip = Math.random() < 0.2;
    value = dip ? Math.round(gaussian(dip ? 86 : 96, 3)) : Math.round(gaussian(base.SpO2, 1.5));
    value = Math.max(70, Math.min(100, value));
    unit = '%';
    severity = value < 85 ? 'high' : value < 90 ? 'medium' : 'low';
  } else if (param === 'RR') {
    value = Math.round(gaussian(base.RR + (state.onPropofol ? 3 : 0), 3));
    value = Math.max(8, Math.min(40, value));
    unit = '/min';
    severity = value > 30 ? 'high' : value > 24 ? 'medium' : 'low';
  } else if (param === 'Temp') {
    value = parseFloat(gaussian(base.Temp, 0.4).toFixed(1));
    value = Math.max(35.5, Math.min(40.5, value));
    unit = '°C';
    severity = value >= 39.5 ? 'high' : value >= 38.5 ? 'medium' : 'low';
  } else if (param === 'BP-sys') {
    value = Math.round(gaussian(base.BP_sys, 12));
    value = Math.max(65, Math.min(210, value));
    unit = 'mmHg';
    severity = value > 180 || value < 80 ? 'high' : value > 140 || value < 90 ? 'medium' : 'low';
  }

  // Update state
  if (param === 'HR') state.lastHR = value;
  if (param === 'SpO2') state.lastSpO2 = value;

  return {
    eventType: 'vitals',
    source: bay,
    param,
    value: String(value),
    unit,
    severity,
    rawContext: null,
  };
}

function generateDeviceEvent() {
  const device = pick(DEVICE_SOURCES);
  const param = pick(['lead-off', 'apnea', 'arrhythmia', 'low-battery']);

  let value, severity;
  if (param === 'lead-off') {
    value = 'displaced';
    severity = 'low';
  } else if (param === 'apnea') {
    value = '15s no respiration';
    severity = Math.random() < 0.15 ? 'high' : 'medium'; // rare but serious
  } else if (param === 'arrhythmia') {
    value = pick(['AFIB detected', 'V-tach', 'irregular rhythm']);
    severity = 'medium';
  } else {
    value = '20% remaining';
    severity = 'low';
  }

  return {
    eventType: 'device',
    source: device,
    param,
    value,
    unit: '',
    severity,
    rawContext: null,
  };
}

function generateMedicationEvent() {
  const bay = pick(SOURCES);
  const meds = [
    { param: 'infusion', value: 'Propofol 1% — 20 mcg/kg/min', severity: 'low' },
    { param: 'bolus', value: 'Fentanyl 50 mcg IV', severity: 'low' },
    { param: 'infusion', value: 'Norepinephrine 0.1 mcg/kg/min', severity: 'medium' },
    { param: 'dose-change', value: 'Midazolam increased to 2 mg/hr', severity: 'low' },
  ];
  const med = pick(meds);

  return {
    eventType: 'medication',
    source: bay,
    param: med.param,
    value: med.value,
    unit: '',
    severity: med.severity,
    rawContext: null,
  };
}

module.exports = { tick };