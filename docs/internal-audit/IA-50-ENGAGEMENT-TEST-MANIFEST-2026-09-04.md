# IA 50-E2E Programme — Wave B Manifest
## Plan B — FY2027 · 50 Engagements · Full Enterprise E2E Certification

Date: 2026-09-04
Environment: TEST (Lovable Cloud)
Baseline HEAD: `eb5cb9af50df46a2a16197af0c0808fb571cda76`
Status: **GATE B0 (rebaseline) PASSED — execution pending**

---

## 1. Gate B0 — Mandatory rebaseline (read-only, verified)

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| Working tree | clean, at stated HEAD | clean, `eb5cb9af5` | PASS |
| Plan A present and Closed | 1 plan, Closed | `eaf54ed7-ce3f-42bb-8b35-a2f6bec2556a` — "IA-E2E-PRIOR — Prior Audit History Certification", FY2026, **Closed** | PASS |
| Plan A engagements | 5 terminal | 5 (`IA-ENG-SKN-2026-000038..000042`): 2 Closed, 3 Closed – Actions Pending | PASS |
| Plan A findings | 4 | `IA-FND-SKN-2026-000022` (Closed, High), `...23` (Responded, High), `...24` (Responded, Medium), `...25` (Responded, Medium) | PASS |
| Prior corrective actions | 1 Closed + 3 open | ACT-2026-00036 Closed 100%; 00037 40%; 00038 10%; 00039 50% | PASS |
| Follow-ups | 1 Scheduled | 1 (Scheduled) | PASS |
| FY2027 reserved and unused | 0 plans | FY2027 OPEN, no plans | PASS |
| Other operational plans | 0 | 0 | PASS |

### Numbering counters at Wave B start (canonical Stage 2C/2F engine)

| Sequence | Prefix | Current |
|---|---|---|
| INTERNAL_AUDIT/ENGAGEMENT | IA-ENG-SKN | 42 |
| INTERNAL_AUDIT/FINDING | IA-FND-SKN | 25 |
| INTERNAL_AUDIT/WORKING_PAPER | IA-WP-SKN | 32 |
| INTERNAL_AUDIT/EVIDENCE | IA-EVD-SKN | 51 |
| INTERNAL_AUDIT/REPORT | IA-RPT-SKN | 28 |
| INTERNAL_AUDIT/LEAVE_REQUEST | IA-LR-SKN | 21 |

Plan B engagement references are therefore expected to begin at `IA-ENG-SKN-2027-000043`
(or the FY-scoped equivalent produced by the server) and must be **server-allocated only**.

### Reference masters available (Stage 2B canonical)

- Audit Type (9): PLANNED_AUDIT, ADHOC_AUDIT, MANAGEMENT_REQUESTED, SPECIAL_INVESTIGATION,
  FOLLOW_UP_AUDIT, ASSURANCE, OPERATIONAL, COMPLIANCE, SUPPLEMENTARY
- Coverage Category (9): CORE_COVERAGE, RISK_DRIVEN, CYCLICAL, COMPLIANCE, FINANCIAL,
  OPERATIONAL, IT, GOVERNANCE, SPECIAL
- Follow-Up Type (7): ACTION_VERIFICATION, IMPLEMENTATION_CHECK, EVIDENCE_COLLECTION,
  RE_TEST, MANAGEMENT_MEETING, NEXT_AUDIT, OTHER

### Organisation masters used (live, unmodified)

Benefits, Compliance, Finance, Human Resources, Information Technology, Administration,
Registration & Records, Office of the Director, Internal Audit — with their existing
department functions and risk ratings.

---

## 2. Plan B target disposition (contract)

| Terminal disposition | Target |
|---|---|
| Closed | 25 |
| Closed – Actions Pending | 15 |
| Cancelled | 5 |
| Carried Forward | 5 |
| Undisposed | 0 |
| **Total** | **50** |

Carry-forward acceptances (5) are executed at batch B10 only, and Plan C (FY2028) is
created at that point solely as the receiving plan for governed carry-forward.

---

## 3. Engagement matrix (B1–B10 · 5 per batch)

| # | Batch | Department | Function | Audit type | Coverage | Risk | Target disposition |
|---|---|---|---|---|---|---|---|
| B01 | B1 | Benefits | Benefits Payment Processing | PLANNED_AUDIT | CORE_COVERAGE | Critical | Closed |
| B02 | B1 | Benefits | Long-Term Benefits (Pensions) | PLANNED_AUDIT | CORE_COVERAGE | Critical | Closed |
| B03 | B1 | Benefits | Short-Term Benefits Processing | OPERATIONAL | OPERATIONAL | High | Closed – Actions Pending |
| B04 | B1 | Benefits | Overpayment Recovery | RISK-driven ADHOC_AUDIT | RISK_DRIVEN | High | Closed |
| B05 | B1 | Benefits | Medical Board Administration | ASSURANCE | CYCLICAL | Medium | Closed |
| B06 | B2 | Compliance | Contribution Processing (C3) | PLANNED_AUDIT | CORE_COVERAGE | Critical | Closed – Actions Pending |
| B07 | B2 | Compliance | Employer Registration & Monitoring | COMPLIANCE | COMPLIANCE | High | Closed |
| B08 | B2 | Compliance | Arrears Management | FOLLOW_UP_AUDIT | RISK_DRIVEN | High | Closed – Actions Pending |
| B09 | B2 | Compliance | Self-Employed Contributions | OPERATIONAL | OPERATIONAL | High | Closed |
| B10 | B2 | Compliance | Field Inspections | ASSURANCE | CYCLICAL | Medium | Cancelled |
| B11 | B3 | Finance | Accounts Payable | PLANNED_AUDIT | FINANCIAL | High | Closed |
| B12 | B3 | Finance | Accounts Receivable & Collections | PLANNED_AUDIT | FINANCIAL | High | Closed – Actions Pending |
| B13 | B3 | Finance | Treasury & Cash Management | ASSURANCE | FINANCIAL | High | Closed |
| B14 | B3 | Finance | General Ledger & Reporting | COMPLIANCE | FINANCIAL | High | Closed |
| B15 | B3 | Finance | Payroll Processing | PLANNED_AUDIT | CORE_COVERAGE | High | Closed – Actions Pending |
| B16 | B4 | Finance | Budgeting & Financial Planning | OPERATIONAL | OPERATIONAL | Medium | Closed |
| B17 | B4 | Information Technology | IT Security & Access Control | PLANNED_AUDIT | IT | Critical | Closed – Actions Pending |
| B18 | B4 | Information Technology | Application Development & Maintenance | FOLLOW_UP_AUDIT | IT | High | Closed |
| B19 | B4 | Information Technology | Infrastructure & Network | ASSURANCE | IT | High | Closed |
| B20 | B4 | Information Technology | Data Management & Reporting | OPERATIONAL | IT | High | Cancelled |
| B21 | B5 | Information Technology | IT Governance & Compliance | COMPLIANCE | GOVERNANCE | High | Closed |
| B22 | B5 | Human Resources | Leave & Attendance Management | FOLLOW_UP_AUDIT | OPERATIONAL | Medium | Closed – Actions Pending |
| B23 | B5 | Human Resources | Recruitment & Onboarding | PLANNED_AUDIT | OPERATIONAL | Medium | Closed |
| B24 | B5 | Human Resources | Performance Management | ASSURANCE | OPERATIONAL | Medium | Closed |
| B25 | B5 | Administration | Procurement & Purchasing | PLANNED_AUDIT | CORE_COVERAGE | High | Closed – Actions Pending |
| B26 | B6 | Administration | Inventory & Stores | OPERATIONAL | OPERATIONAL | Medium | Closed |
| B27 | B6 | Administration | Asset Management | CYCLICAL ASSURANCE | CYCLICAL | Medium | Closed |
| B28 | B6 | Administration | Facilities Management | OPERATIONAL | OPERATIONAL | Medium | Cancelled |
| B29 | B6 | Registration & Records | Insured Person Registration | PLANNED_AUDIT | CORE_COVERAGE | High | Closed |
| B30 | B6 | Registration & Records | Data Quality & Deduplication | RISK-driven ADHOC_AUDIT | RISK_DRIVEN | High | Closed – Actions Pending |
| B31 | B7 | Registration & Records | Records Management & Archives | COMPLIANCE | COMPLIANCE | Medium | Closed |
| B32 | B7 | Office of the Director | Strategic Planning & Policy | GOVERNANCE ASSURANCE | GOVERNANCE | Medium | Closed |
| B33 | B7 | Office of the Director | Legal & Compliance Advisory | COMPLIANCE | GOVERNANCE | Medium | Closed – Actions Pending |
| B34 | B7 | Office of the Director | Public Relations & Communications | OPERATIONAL | OPERATIONAL | Medium | Cancelled |
| B35 | B7 | Internal Audit | Quality Assurance & Improvement | ASSURANCE | GOVERNANCE | Low | Closed |
| B36 | B8 | Benefits | Employment Injury Benefits | PLANNED_AUDIT | CORE_COVERAGE | High | Closed |
| B37 | B8 | Compliance | Contribution Processing (C3) — interest & penalty | SPECIAL_INVESTIGATION | SPECIAL | High | Closed – Actions Pending |
| B38 | B8 | Finance | Accounts Payable — supplier master | MANAGEMENT_REQUESTED | SPECIAL | High | Closed |
| B39 | B8 | Information Technology | IT Security & Access Control — privileged access | SPECIAL_INVESTIGATION | IT | Critical | Closed – Actions Pending |
| B40 | B8 | Human Resources | Payroll interface controls | MANAGEMENT_REQUESTED | FINANCIAL | High | Closed |
| B41 | B9 | Benefits | Benefits Payment Processing — repeat risk | FOLLOW_UP_AUDIT | RISK_DRIVEN | Critical | Closed |
| B42 | B9 | Compliance | Arrears Management — prior action retest | FOLLOW_UP_AUDIT | RISK_DRIVEN | High | Closed |
| B43 | B9 | Finance | Accounts Payable — prior action retest | FOLLOW_UP_AUDIT | RISK_DRIVEN | High | Closed – Actions Pending |
| B44 | B9 | Human Resources | Leave & Attendance — disputed finding continuity | FOLLOW_UP_AUDIT | RISK_DRIVEN | Medium | Closed – Actions Pending |
| B45 | B9 | Information Technology | Application Development — follow-up retest | FOLLOW_UP_AUDIT | RISK_DRIVEN | Medium | Cancelled |
| B46 | B10 | Benefits | Medical Board Administration — scope extension | SUPPLEMENTARY | CYCLICAL | Medium | Carried Forward |
| B47 | B10 | Compliance | Field Inspections — territory coverage | SUPPLEMENTARY | CYCLICAL | Medium | Carried Forward |
| B48 | B10 | Finance | Budgeting & Financial Planning — capital plan | SUPPLEMENTARY | FINANCIAL | Medium | Carried Forward |
| B49 | B10 | Registration & Records | Records Management — digitisation | SUPPLEMENTARY | OPERATIONAL | Medium | Carried Forward |
| B50 | B10 | Administration | Asset Management — disposal cycle | SUPPLEMENTARY | CYCLICAL | Medium | Carried Forward |

Disposition tally: Closed 25 · Closed – Actions Pending 15 · Cancelled 5 · Carried Forward 5.

Engagements B41–B45 deliberately consume Plan A prior-audit history (prior actions
ACT-2026-00036..39 and findings IA-FND-SKN-2026-000022..25) through
`ia_prior_audit_history` / `ia_link_prior_action` — reference only, never re-parented.

---

## 4. Execution rules restated for this wave

- All lifecycle transitions run through governed server commands; no direct DML, no
  service-role shortcuts, no client-generated references.
- Plan A remains untouched; any Plan A mutation is a wave-level failure.
- DEF-50E2E-001 regression (auditee/management cannot mutate IA work products) is re-run
  at every batch gate.
- Batch evidence is written to `IA-50E2E-PLAN-B-BATCH-B{n}-2026-09-04.md` only after the
  batch's own reconciliation passes.
- No production deployment in this wave.

---

## 5. Current position

Gate B0 passed. Plan B has **not** yet been created; no Wave B writes have been made.
Execution resumes at Section 3, batch B1, using authenticated persona sessions
(HIA, Lead Auditor, Team Member, QA Reviewer, department management) which must be
re-minted in the current sandbox before any write.
