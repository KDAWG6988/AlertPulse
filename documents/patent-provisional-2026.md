# AlertPulse Provisional Patent — Technical Specification
**Filed:** June 9, 2026 | **Expires:** April 9, 2027 | **Jurisdiction:** US

---

## System Overview

AlertPulse is an AI-native hospital alarm triage system that deploys autonomous agents to monitor ICU signal data 24/7. The core innovation is a clinical rule-based classifier that triages alarms as **dispatch** (require immediate clinical response), **suppress** (benign/artifact), or **monitor** (borderline — escalate only if sustained).

The system processes raw alarm events from hospital physiological monitors, applies a 16-rule clinical library, generates FHIR-compatible structured output, and surfaces actionable signals to clinical staff via a real-time dashboard.

### Core Components
1. **Alarm Ingestion Layer** — Receives events from hospital monitor feeds (HL7/FHIR R4)
2. **Triage Classifier** — 16-rule clinical engine classifies each event by urgency
3. **FHIR Export** — Outputs structured `Observation` resources for EMR integration
4. **EU AI Act Compliance Layer** — Risk classification, transparency logs, human oversight
5. **Real-time Dashboard** — Live feed of triage decisions, suppression rates, priority scores

---

## 8 Claims

**Claim 1** (Independent): A computer-implemented method for triaging physiological monitor alarms in an intensive care unit, comprising: receiving a raw alarm event from a physiological monitor; extracting a plurality of signal parameters from the raw alarm event; applying a clinical rule library to classify the alarm event as actionable, suppressible, or monitor-pending; generating a structured triage decision comprising an action classification, a confidence score, and a human-readable reason; and surfacing the triage decision to a clinical dashboard within 2 seconds of alarm onset.

**Claim 2** (Independent): A system for ICU alarm fatigue reduction comprising: a signal ingestion module receiving alarm events from a plurality of physiological monitors; a classification engine implementing a clinical rule library of at least 10 rules, each rule defining conditions under which an alarm is suppressible based on signal parameter thresholds and temporal patterns; and an output module generating FHIR R4 `Observation` resources for each triage decision, wherein suppressible alarms are flagged with `status: final` and `interpretation: N` to prevent duplicate clinical alerts.

**Claim 3** (Dependent on Claim 1): The method of claim 1, wherein the clinical rule library comprises at least 16 rules including: artifact detection based on signal amplitude decay rate, duplicate alarm suppression for concurrent multi-parameter alerts from a single patient, medication-adjacency rules suppressing alarms within a configurable window of analgesic administration, and sustained-threshold rules requiring parameter persistence across a configurable time window before dispatch.

**Claim 4** (Dependent on Claim 1): The method of claim 1, further comprising: querying a FHIR-compliant electronic medical record system for contextual patient data including active medication orders, recent lab values, and ventilator settings; and incorporating said contextual data into the classification decision.

**Claim 5** (Dependent on Claim 2): The system of claim 2, wherein the classification engine further implements a machine learning layer that refines rule thresholds based on historical triage outcomes, the machine learning layer being trained on structured alarm events labeled with clinician feedback.

**Claim 6** (Independent): A non-transitory computer-readable medium storing instructions that, when executed by a processor, cause the processor to: maintain an in-memory ring buffer of alarm events; apply a clinical rule library to each event in the ring buffer; emit triage decisions to a streaming API endpoint; and generate a suppression rate metric updated in real time.

**Claim 7** (Dependent on Claim 1): The method of claim 1, wherein the clinical rule library is configurable per hospital ICU, allowing per-rule threshold adjustment and per-rule enable/disable without redeployment.

**Claim 8** (Dependent on Claim 2): The system of claim 2, further comprising a compliance logging layer that records every triage decision with a timestamp, rule applied, and confidence score, in a format compliant with EU AI Act Article 12 audit trail requirements.

---

## 16-Rule Clinical Library

| # | Rule ID | Action | Trigger Condition | Suppression Category |
|---|---------|--------|-------------------|---------------------|
| 1 | `ARTIFACT_HR_DROP` | suppress | HR < 40 bpm lasting < 10s, not confirmed | signal artifact |
| 2 | `ARTIFACT_SPO2_DROP` | suppress | SpO2 drop > 10% in < 5s, no sustained threshold breach | signal artifact |
| 3 | `ARTIFACT_BP_SPIKE` | suppress | MAP spike > 200 mmHg lasting < 8s, no organ damage context | signal artifact |
| 4 | `DUPLICATE_MULTI_PARAM` | suppress | ≥ 2 alarms from same patient within 30s, same parameter family | duplicate |
| 5 | `DUPLICATE_CROSS_PARAM` | suppress | SpO2 + HR alarms from same patient within 60s | duplicate |
| 6 | `MED_ADJACENCY_OPIOID` | suppress | SpO2 ≤ 92 within 15 min of opioid administration, no respiratory distress signs | medication-adjacent |
| 7 | `MED_ADJACENCY_SEDATION` | suppress | RR alarm within 30 min of midazolam/propofol bolus, stable sedation context | medication-adjacent |
| 8 | `SUSTAINED_THRESHOLD_HR` | dispatch | HR > 150 or < 40 sustained > 60s, not medication-adjacent | sustained_critical |
| 9 | `SUSTAINED_THRESHOLD_SPO2` | dispatch | SpO2 ≤ 88 sustained > 30s, no do-not-intubate context | sustained_critical |
| 10 | `SUSTAINED_THRESHOLD_BP` | dispatch | MAP < 55 or > 180 sustained > 45s | sustained_critical |
| 11 | `MONITOR_BORDERLINE_HR` | monitor | HR 130-150 or 40-50 sustained 20-45s — not actionable yet | borderline |
| 12 | `MONITOR_BORDERLINE_SPO2` | monitor | SpO2 88-92 sustained 15-30s | borderline |
| 13 | `VENT_ALARM_MATCHED` | suppress | Vent alarm correlated with scheduled suction or routine care event | procedure-adjacent |
| 14 | `NO_RESP_RATE_CONTACT` | dispatch | Apnea alarm (RR = 0) > 15s with no recent opioid — immediate response | no_response |
| 15 | `NIBP_CUFF_CONFOUND` | suppress | MAP spike within 60s of NIBP cuff inflation cycle | equipment-confound |
| 16 | `CTX_SWITCH_OVERSENSITIVE` | monitor | Multiple alarms within 5 min of attending shift change — handoff artifact | context-switch |

---

## FHIR Integration Architecture

### Supported FHIR Version
FHIR R4 (v4.0.1)

### Resources Used
- **`Observation`** — Primary output. One per alarm event. Contains code, value, status, interpretation, component observations.
- **`Task`** — Dispatch actions create `Task` resources assigned to appropriate care team role.
- **`Condition`** — Active patient alerts linked via `Observation.subject` reference.
- **`AuditEvent`** — All triage decisions logged as `AuditEvent` for compliance and audit trail.

### Key Mappings
```
AlertPulse Event → FHIR Observation
  event_type     → Observation.code (LOINC)
  severity       → Observation.status + interpretation
  triage_action  → Observation.interpretation (N=normal/suppressed, A=abnormal/actionable)
  priority_score → Observation.extension[priorityScore]
```

### EMR Integration
- RESTful polling from hospital EMR systems via FHIR `$everything` operation
- Webhook subscription for real-time event push (FHIR Subscription R4)
- OAuth2-based SMART on FHIR authentication for multi-tenant hospital systems

### EU AI Act Compliance
- **Classification**: Class IIa (Software as a Medical Device — SaMD for ICU monitoring)
- **Transparency**: Every triage decision is logged with explainability field
- **Human Oversight**: Borderline/monitor alarms require clinician confirmation before dispatch
- **Audit Trail**: Complete decision log stored for 5+ years per Article 12 requirements
- **Post-Market Monitoring**: Real-time suppression rate dashboard for regulatory reporting

---

## Prior Art Search Summary

*See: documents/patent-prior-art-2026.md for full search results and analysis*

### Search Databases
- USPTO PatFT (patft.uspto.gov)
- Google Patents (patents.google.com)
- WIPO PCT Database (patentscope.wipo.int)
- IEEE Xplore (for medical device literature)

### Key Search Terms
- ICU alarm suppression
- Physiological monitor triage
- Alarm fatigue
- Medical device alarm classification
- Patient monitor alert prioritization

### Relevant References Found
*(Full list in documents/patent-prior-art-2026.md)*

---

## Filing Cost Estimates

| Item | Amount | Notes |
|------|--------|-------|
| USPTO filing fee (micro-entity) | $350 | Via MyUSPTO — requires qualifying declaration |
| Attorney drafting fees | $2,000–$8,000 | Varies by firm; see attorney list |
| USPTO search report (optional) | $100–$600 | Patent Cooperative Treaty search |
| Total estimated (no attorney) | ~$350–$500 | Self-file via micro-entity status |
| Total estimated (with attorney) | ~$2,350–$9,100 | Including drafting + filing fees |

---

*Document generated 2026-06-09. Non-provisional deadline: April 9, 2027.*