/**
 * lib/fhir.js — FHIR R4 Observation export (stub / export only).
 *
 * DEMO ONLY — NOT FOR CLINICAL USE. This converts a stored alarm event
 * + triage decision into a FHIR R4 Observation resource for inspection
 * and testing. There is NO real EMR connection, no FHIR server, no
 * SMART on FHIR auth, and no live feed in this app — nothing here is
 * sent to or received from any hospital system.
 *
 * Mapping (see documents/patent-provisional-2026.md for the intended
 * mappings; only what the stored event actually contains is used):
 *   event param     -> Observation.code (LOINC-ish display; code is the
 *                      param string itself when no LOINC code is known)
 *   value + unit    -> Observation.valueQuantity
 *   triage action   -> Observation.interpretation:
 *                      suppress -> N (normal / suppressed)
 *                      dispatch -> A (abnormal / actionable)
 *                      monitor  -> (no interpretation; see note)
 *   priority_score  -> Observation.extension[priorityScore]
 *   reason / rule   -> Observation.note
 */

const LOINC = {
  HR: { code: '8867-4', display: 'Heart rate' },
  SpO2: { code: '2708-6', display: 'Oxygen saturation in Arterial blood' },
  RR: { code: '9279-1', display: 'Respiratory rate' },
  Temp: { code: '8310-5', display: 'Body temperature' },
  'BP-sys': { code: '8480-6', display: 'Systolic blood pressure' },
  MAP: { code: '8478-0', display: 'Mean blood pressure' },
  BP: { code: '85354-9', display: 'Blood pressure panel' },
};

function toObservation(event, decision) {
  if (!event) throw new Error('event is required');
  const loinc = LOINC[event.param] || { code: event.param, display: event.param };
  const numericValue = parseFloat(event.value);
  const action = decision ? decision.action : null;

  const observation = {
    resourceType: 'Observation',
    id: `alertpulse-${event.id}`,
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }],
      text: event.param,
    },
    subject: { reference: event.source ? `Location/${event.source}` : undefined },
    effectiveDateTime: event.created_at ? new Date(event.created_at).toISOString() : undefined,
    issued: event.created_at ? new Date(event.created_at).toISOString() : undefined,
  };
  if (!observation.subject.reference) delete observation.subject;
  if (!observation.effectiveDateTime) delete observation.effectiveDateTime;
  if (!observation.issued) delete observation.issued;

  if (Number.isFinite(numericValue)) {
    observation.valueQuantity = {
      value: numericValue,
      unit: event.unit || '',
      system: 'http://unitsofmeasure.org',
      code: event.unit || '',
    };
  } else {
    observation.valueString = String(event.value);
  }

  // interpretation: N = suppressed/normal, A = dispatched/abnormal.
  // monitor has no interpretation — the note records the decision instead.
  if (action === 'suppress') {
    observation.interpretation = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'N', display: 'Normal' }] }];
  } else if (action === 'dispatch') {
    observation.interpretation = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'A', display: 'Abnormal' }] }];
  }

  if (decision && decision.priority_score !== undefined && decision.priority_score !== null) {
    observation.extension = [{
      url: 'https://alertpulse.example/fhir/StructureDefinition/priorityScore',
      valueInteger: decision.priority_score,
    }];
  }

  if (decision) {
    const parts = [];
    if (decision.action) parts.push(`Triage action: ${decision.action}`);
    if (decision.rule_applied) parts.push(`Rule: ${decision.rule_applied}`);
    if (decision.confidence !== undefined && decision.confidence !== null) parts.push(`Confidence: ${decision.confidence}`);
    if (decision.reason) parts.push(decision.reason);
    if (decision.suppression_category) parts.push(`Suppression category: ${decision.suppression_category}`);
    observation.note = [{ text: parts.join(' — ') }];
  }

  return observation;
}

module.exports = { toObservation, LOINC };
