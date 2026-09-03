# IA 50-E2E Programme — Wave A Manifest
## Plan A — Prior-Audit History Fixture (FY2026)

Date: 2026-09-04
Environment: TEST (Lovable Cloud)
Scope: Plan A only. Plan B (50 engagements) and Plan C not started.

## 1. Plan

| Attribute | Value |
|---|---|
| Plan ID | `eaf54ed7-ce3f-42bb-8b35-a2f6bec2556a` |
| Title | IA-E2E-PRIOR — Prior Audit History Certification |
| Fiscal year | FY2026 (`core_fiscal_year` master; FY2027 reserved for Plan B, untouched) |
| Lifecycle | Draft → Submitted (Lead Auditor) → Approved (HIA) → **Closed** |
| Engagements | 5 planned / 5 completed / 0 cancelled / 0 carried forward |
| Completion rate | 100% (closed with 3 "Closed – Actions Pending") |

## 2. Engagements

| Ref | Code | Engagement | Terminal disposition | Report |
|---|---|---|---|---|
| A01 | IA-ENG-SKN-2026-000038 | Benefits Payment Processing Prior Audit | Closed | IA-RPT-SKN-2026-000024 (Issued) |
| A02 | IA-ENG-SKN-2026-000039 | Arrears Management Prior Audit | Closed | IA-RPT-SKN-2026-000025 (Issued) |
| A03 | IA-ENG-SKN-2026-000040 | Accounts Payable Prior Audit | Closed – Actions Pending | IA-RPT-SKN-2026-000026 (Issued) |
| A04 | IA-ENG-SKN-2026-000041 | Leave & Attendance Management Prior Audit | Closed – Actions Pending | IA-RPT-SKN-2026-000027 (Issued) |
| A05 | IA-ENG-SKN-2026-000042 | Application Development & Maintenance Prior Audit | Closed – Actions Pending | IA-RPT-SKN-2026-000028 (Issued) |

All engagement codes, finding IDs, working-paper, evidence and report references were
allocated server-side by the Stage 2C/2F canonical numbering engine. No client-generated
identifier was accepted.

## 3. Distinct prior-history outcomes (fixture intent)

| Ref | Finding | Severity | Management position | Action state | Prior-history value for Plan B |
|---|---|---|---|---|---|
| A01 | none (clean audit) | — | — | — | Clean prior audit baseline |
| A02 | IA-FND-SKN-2026-000022 (Closed) | High | Accepted | ACT-2026-00036 Closed, 100%, independently verified | Fully remediated prior action |
| A03 | IA-FND-SKN-2026-000023 (Responded) | High | Accepted | ACT-2026-00037 In Progress, 40% | Open prior action carried into next cycle |
| A04 | IA-FND-SKN-2026-000024 (Responded) | Medium | Rejected → disputed → **Retained with Disagreement** (Audit Committee ref AC/2026/07) | ACT-2026-00038 In Progress, 10% | Disputed finding continuity |
| A05 | IA-FND-SKN-2026-000025 (Responded) | Medium | Partially Accepted | ACT-2026-00039 In Progress, 50%, follow-up scheduled 2027-02-26 | Repeat-risk / follow-up retest candidate |

## 4. Execution artefacts

| Artefact | Count |
|---|---|
| Fieldwork activities (RCM process / risk / control coverage) | 10 |
| Working papers | 11 |
| Evidence records | 10 |
| Control tests concluded | 5 (A01 Effective, A02/A03 Ineffective, A04/A05 Partially Effective) |
| Findings | 4 |
| Corrective actions | 4 (1 Closed, 3 In Progress) |
| Follow-ups | 1 (A05, due 2027-02-26) |
| Quality reviews | 6 (incl. A03 rework cycle with revised report version) |
| Communication stages (Entrance / Draft Discussion / Exit) | 15 |
| Immutable IA events | 1,476 |

## 5. Governance behaviour observed (positive control)

- `ia_close_engagement` refused A02 while a corrective action remained open (`IA_ACTIONS_PENDING`);
  A02 was only closed as `Closed` after the verified action was closed through `ia_action_close_v2`.
- QA self-review was refused (`IA_SOD_VIOLATION`).
- A03 report restart was refused until rework was cleared (`IA_REWORK_OUTSTANDING`).
- A04 report issuance was refused until the dispute received formal disposition.
- Engagement launch was refused without auditee contact and prior-history acknowledgement (`IA_NOT_READY`).

## 6. Boundaries respected

- No service-role shortcuts. All lifecycle actions were performed with authenticated
  persona sessions (HIA, Lead Auditor, Team Member, QA Reviewer, department management).
- Masters, reference values, numbering counters and preserved history untouched other
  than normal sequence consumption.
- FY2027 remains reserved and unused; Plan B and Plan C not created.
