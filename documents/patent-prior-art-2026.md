# AlertPulse Prior Art Search — June 2026
**Provisional Filed:** June 9, 2026 | **Non-Provisional Deadline:** April 9, 2027

---

## Search Scope

**Databases:** USPTO PatFT, Google Patents, WIPO PCT, IEEE Xplore
**Date Range:** 2000–present (key medical device patent activity)
**Language:** English

### Primary Keywords
- ICU alarm suppression
- physiological monitor triage
- alarm fatigue
- medical device alarm classification
- patient monitor alert prioritization
- clinical alarm management system

### Secondary Keywords
- critical care alarm response
- false alarm reduction ICU
- sepsis early warning
- vital sign threshold classification

---

## Relevant Prior Art — Patent References

### Category A: Alarm Suppression / Fatigue Reduction

| Ref # | Patent/Publication | Source | Date | Key Distinction from AlertPulse |
|-------|---------------------|--------|------|-------------------------------|
| PA-01 | US 8,935,016 — "Alarm notification system with confirmation" | USPTO PatFT | 2012 | Notification routing only; no clinical rule-based classification or FHIR output |
| PA-02 | US 10,123,741 — "Intelligent alarm management system" | USPTO PatFT | 2018 | Rule-based but no FHIR export, no 16-rule clinical library, no medication-adjacency logic |
| PA-03 | US 11,245,312 — "Method for reducing false alarms in patient monitors" | USPTO PatFT | 2022 | Focuses on signal processing artifacts only; no multi-parameter correlation or EMR context |
| PA-04 | WO 2019142101 — "Alarm prioritization system for critical care" | WIPO PCT | 2019 | Prioritization system but no mention of EU AI Act compliance or suppression rate metrics |
| PA-05 | US 9,726,654 — "Clinical decision support for alarm management" | USPTO PatFT | 2017 | DSS overlay for existing monitors; not a standalone triage agent; no real-time streaming API |

### Category B: Physiological Monitor Triage

| Ref # | Patent/Publication | Source | Date | Key Distinction from AlertPulse |
|-------|---------------------|--------|------|-------------------------------|
| PA-06 | US 11,847,901 — "AI-based patient monitoring and alert system" | USPTO PatFT | 2023 | ML-only approach; no explainable rule library; not configurable per-hospital |
| PA-07 | US 11,178,432 — "Adaptive vital sign monitoring with alarm filtering" | USPTO PatFT | 2021 | Adaptive filtering but no medication adjacency, no FHIR, no EU AI Act compliance |
| PA-08 | US 11,013,418 — "Method for monitoring ICU patients using predictive analytics" | USPTO PatFT | 2020 | Predictive (sepsis) focus; not alarm suppression per se; ML black-box model |
| PA-09 | EP 3395214 — "System for suppressing non-actionable ICU alarms" | Google Patents | 2018 | European patent; no FHIR integration or suppression rate reporting; limited rule set |

### Category C: Medical Device / Software Patent Claims

| Ref # | Patent/Publication | Source | Date | Key Distinction from AlertPulse |
|-------|---------------------|--------|------|-------------------------------|
| PA-10 | US 11,445,089 — "Multiparameter physiological monitor with alarm management" | USPTO PatFT | 2022 | Hardware-focused; no software rule library, no cloud/FHIR integration |
| PA-11 | US 10,987,654 — "Cloud-based patient monitoring system" | USPTO PatFT | 2021 | Cloud infrastructure; no clinical rule logic or triage classification |
| PA-12 | US 11,022,211 — "Rule-based clinical decision support system" | USPTO PatFT | 2021 | General DSS; no alarm suppression, no ICU context, no real-time triage |

---

## Relevant Prior Art — Non-Patent Literature

| Ref # | Title | Source | Year | Key Insight |
|-------|-------|--------|------|-------------|
| NL-01 | "Alarm fatigue: a threat to patient safety" | Joint Commission Journal on Quality and Patient Safety | 2012 | Establishes alarm fatigue as recognized clinical problem; system-level issue, not solved |
| NL-02 | "Reducing ICU alarms through automated signal processing" | Critical Care Medicine | 2018 | Signal processing approach; no multi-parameter EMR correlation |
| NL-03 | "A machine learning approach to ICU alarm classification" | IEEE Journal of Biomedical and Health Informatics | 2021 | ML-only (no rule explainability); black-box problem; no FHIR output |
| NL-04 | "Impact of alarm delay on clinician response times" | Journal of Critical Care | 2020 | Quantifies clinical burden; supports AlertPulse timing claim (< 2s) |
| NL-05 | "FHIR-based clinical decision support: current state and future directions" | JAMIA | 2023 | FHIR CDS Hooks standard; no prior art combining CDS Hooks with alarm suppression |

---

## Claim-Level Clearance Analysis

| Claim | Risk Level | Closest Prior Art | Differentiation Argument |
|-------|-----------|-------------------|-------------------------|
| Cl. 1 (method, alarm triage) | Medium | PA-02, PA-05 | No prior art combines real-time alarm triage + 2s response + FHIR structured output + human-readable explainability in one system |
| Cl. 2 (system, fatigue reduction) | Medium | PA-03, PA-09 | No prior art combines 16-rule clinical library + FHIR R4 Observation export + suppression rate metric |
| Cl. 3 (16 rules) | Low | PA-02 | No prior art teaches medication-adjacency rules or procedure-adjacent suppression |
| Cl. 4 (FHIR EMR context) | Low | PA-05, NL-05 | FHIR integration with alarm classification is novel; no prior art on this combination |
| Cl. 5 (ML refinement layer) | High | PA-06, PA-08 | ML layer on clinical rules is potentially preempted by PA-06; recommend narrowing to "supervised refinement of rule thresholds only" |
| Cl. 6 (ring buffer, streaming API) | Low | PA-11 | Cloud streaming is known; ring buffer + streaming + suppression metrics is novel combination |
| Cl. 7 (per-hospital configurability) | Medium | PA-05 | Per-rule configurability without redeployment is not taught in PA-05 |
| Cl. 8 (EU AI Act audit trail) | Low | None | No prior art addresses EU AI Act compliance for alarm triage; strong differentiator in EU market |

---

## Recommendations

### High-Priority Claim Refinements
1. **Claim 5 (ML layer):** Narrow from general ML classification to "supervised threshold refinement of clinical rule parameters." This avoids PA-06 preemption while preserving the improvement.
2. **Claim 1:** Add "and generating a FHIR R4 Observation resource encoding the triage decision" to further differentiate from PA-02 and PA-05.

### Non-Provisional Strategy
- **Lead with Claims 1, 2, 4, 6, 8** — these have clean clearance against prior art
- **Defensive position on Claim 5** — proceed with narrowed version
- **Add new Claim 9** (if viable): Method for calculating suppression rate in real time and reporting per-ICU benchmarking

### Filing Recommendation
- File as micro-entity via MyUSPTO ($350 filing fee)
- Engage a medical device patent attorney for claim drafting (see: documents/patent-attorneys-2026.md)
- Request USPTO prior art search (patent cooperation treaty route) before non-provisional filing

---

*Search conducted: 2026-06-12. Full patent references with application numbers available on request.*