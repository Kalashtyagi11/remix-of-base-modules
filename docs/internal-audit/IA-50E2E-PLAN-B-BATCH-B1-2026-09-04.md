# IA 50-E2E Programme — Wave B

## Plan B (FY2027) creation and Batch B1 execution

Date: 2026-09-04
Environment: TEST (Lovable Cloud)
Scope: Gate B0.5 persona harness, Plan B creation, Batch B1 (E01–E05). Batches B2–B10 and Plan C not started.

## 1. Gate B0.5 — persona harness

Nine canonical TEST personas re-minted and authenticated with per-persona JWTs.
No service-role key was used at any point in this wave.

| Persona | Account | Auth | Role match |
|---|---|---|---|
| Head of Internal Audit | audit.hia@ | OK | OK |
| Lead Auditor | audit.lead@ | OK | OK |
| IA Administrator | audit.admin@ | OK | OK |
| Team Member 1 | audit.auditor1@ | OK | OK |
| Team Member 2 | audit.auditor2@ | OK | OK |
| Quality Reviewer | audit.qa@ | OK | OK |
| Management — Benefits | audit.mgmt.benefits@ | OK | OK |
| Management — Compliance | audit.mgmt.compliance@ | OK | OK |
| Management — Finance | audit.mgmt.finance@ | OK | OK |

**DEF-50E2E-001 regression:** a Management Respondent attempting a direct REST mutation of a
Plan A finding was **DENIED** (zero rows affected under RLS), while the governed
`ia_q_management_actions` surface remained **ALLOWED**. Regression confirmed closed.

## 2. Gate B0 delta and resolution

An FY2027 annual plan (`6a72e226-ac06-4ebb-8fe9-feabd9373c7c`, 3 engagements) already existed in
TEST. Per the user's direction the existing plan was **reused and expanded** rather than replaced.
No records were deleted.

The expansion was performed exclusively through governed commands:

1. `ia_apply_plan_revision` (Lead) — material change → status `Pending Revision Approval`, version 4.
2. `ia_decide_annual_plan` (HIA, `changes_requested`) → status `Changes Requested` (working copy).
3. `ia_persist_plan_engagements` (Lead) — 47 engagements inserted (3 pre-existing retained).
4. `ia_submit_annual_plan` (Lead) → `Submitted`, version 5, snapshot count 50.
5. `ia_decide_annual_plan` (HIA, `approve`) → `Approved`.

| Attribute | Value |
|---|---|
| Plan ID | `6a72e226-ac06-4ebb-8fe9-feabd9373c7c` |
| Title | IA-E2E-MASTER — FY2027 Full 50-Engagement Certification |
| Fiscal year | FY2027 |
| Engagements | 50 (50 server-allocated codes, 50 distinct, 0 broken department/function links) |
| Status | Approved |

## 3. Batch B1 — terminal journeys

| Ref | Code | Engagement | Terminal disposition | Report |
|---|---|---|---|---|
| E01 | IA-ENG-SKN-2026-000043 | Benefits Payment Processing | Closed | IA-RPT-SKN-2026-000031 (Issued) |
| E02 | IA-ENG-SKN-2026-000046 | Long-Term Benefits (Pensions) | Closed | IA-RPT-SKN-2026-000032 (Issued) |
| E03 | IA-ENG-SKN-2026-000047 | Short-Term Benefits Processing | Closed – Actions Pending | IA-RPT-SKN-2026-000033 (Issued) |
| E04 | IA-ENG-SKN-2026-000048 | Overpayment Recovery | Closed – Actions Pending | IA-RPT-SKN-2026-000034 (Issued) |
| E05 | IA-ENG-SKN-2026-000049 | Medical Board Administration | Closed – Actions Pending | IA-RPT-SKN-2026-000035 (Issued) |

Distinct business outcomes:

| Ref | Finding | Severity | Management position | Action state |
|---|---|---|---|---|
| E01 | none (clean audit) | — | — | — |
| E02 | IA-FND-SKN-2026-000026 | High | Accepted | Closed, independently verified |
| E03 | IA-FND-SKN-2026-000027 | Medium | Accepted | In Progress, 40% |
| E04 | IA-FND-SKN-2026-000028 | High | Rejected → escalated → **Retained with Disagreement** (AC/2027/03) | In Progress, 10% |
| E05 | IA-FND-SKN-2026-000029 | Medium | Partially Accepted | In Progress, 50%, retest scheduled 2027-09-30 |

Execution artefacts: 10 fieldwork activities, 10 working papers, 11 evidence records
(all server-numbered, incl. IA-EVD-SKN-2026-000063 implementation evidence), 10 control tests
concluded, 4 findings, 4 corrective actions, 1 follow-up, 5 quality reviews, 20 communication stages.

RCM coverage was mapped for four previously uncovered Benefits functions
(processes, risks and controls) before any control test was concluded.

## 4. Governance behaviour observed (positive controls)

- `ia_complete_preparation` refused all five engagements until prior-audit history was
  acknowledged (`IA_PREP_INCOMPLETE`).
- `ia_complete_activity` refused completion with no linked working paper or evidence (`IA_NO_ARTEFACT`).
- `ia_complete_activity` refused a non-member auditor (`IA_FORBIDDEN`) where the team roster
  excluded them.
- `ia_conclude_control_test` refused conclusions with exceptions but no finding (`IA_RATIONALE_REQUIRED`).
- `ia_record_management_response` refused Rejected / Partially Accepted positions without a
  written rationale (`IA_RATIONALE_REQUIRED`).
- Management insert into `ia_evidence` was refused by RLS (audit-owned evidence store).
- `ia_conclude_quality_review` refused engagement-lead self-clearance (`IA_SOD_VIOLATION`).
- `ia_issue_report` refused issuance until draft-finding discussion and exit meeting were
  recorded (`IA_GATE_BLOCKED`).
- `ia_action_submit_completion` refused completion without implementation evidence
  (`IA_EVIDENCE_REQUIRED`); `ia_action_close_v2` refused closure before independent verification.
- `ia_close_engagement` refused disposition `Closed` on E03 with an open action
  (`IA_ACTIONS_PENDING`, suggested `Closed – Actions Pending`).
- `ia_schedule_engagement` refused a non-lead auditor (`IA_FORBIDDEN`).

## 5. Boundaries respected

- All actions performed with authenticated persona sessions; no service-role shortcuts.
- Plan A (FY2026, `eaf54ed7-…`) remains **Closed with 5 engagements** — untouched.
- The three pre-existing FY2027 engagements were retained; only 000043 was taken through B1.
  `IA-ENG-SKN-2026-000045` remains in its pre-existing In Progress state.
- All engagement, finding, working-paper, evidence and report references were allocated
  server-side by the Stage 2C/2F numbering engine.

## 6. Next

Batch B2 (E06–E10) has not been started, per the STOP instruction.
