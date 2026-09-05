# IA 50-E2E Programme — Wave A Certification
## Plan A — Prior-Audit History Fixture

Date: 2026-09-04
Environment: TEST
Verdict: **WAVE A PASS** (one security defect found and closed during the wave)
Production readiness: **not assessed** in this wave.

## 1. Reconciliation

| Check | Expected | Observed | Result |
|---|---|---|---|
| Plan A status | Closed | Closed | PASS |
| Engagements in Plan A | 5 | 5 | PASS |
| Terminal engagements | 5 | 5 (2 Closed, 3 Closed – Actions Pending) | PASS |
| Cancelled / carried forward / undisposed | 0 / 0 / 0 | 0 / 0 / 0 | PASS |
| Issued reports | 5 | 5 (IA-RPT-SKN-2026-000024…000028) | PASS |
| Findings | 4 (A01 clean) | 4 | PASS |
| Open corrective actions after closure | 3 (by design) | 3 | PASS |
| Follow-ups outstanding | 1 | 1 | PASS |
| Server-allocated references | 100% | 100% | PASS |
| FY2027 untouched (reserved for Plan B) | yes | yes | PASS |
| Preserved immutable IA events | grows only | 1,476 | PASS |

Numbering counters after Wave A: ENGAGEMENT 42, FINDING 25, WORKING_PAPER 32,
EVIDENCE 51, REPORT 28, LEAVE_REQUEST 21.

## 2. Security & SoD tests (authenticated personas, no service role)

| ID | Test | Result |
|---|---|---|
| N1 | Team Member closes an engagement | DENIED — `IA_FORBIDDEN` |
| N2 | Client writes terminal engagement status directly | DENIED — `IA_PLAN_CLOSED` |
| N3 | Renumber engagement code | DENIED — `IA_PLAN_CLOSED` |
| N4 | Renumber finding reference | DENIED — `IA_REFERENCE_IMMUTABLE` |
| N5 | Management respondent edits a finding severity | **Initially SUCCEEDED — defect** → now DENIED (0 rows) |
| N6 | Reopen a closed plan by direct write | DENIED — `IA_PLAN_CLOSED` |
| N7 | Edit a terminal engagement's objectives | DENIED — `IA_PLAN_CLOSED` |
| QA | Quality reviewer reviews own work | DENIED — `IA_SOD_VIOLATION` |

### DEF-50E2E-001 — Auditee write access to audit work products (CLOSED)

Cause: RLS write policies on internal audit work-product tables used
`ia_can_access_engagement()`, which also grants department (auditee) respondents.
A management respondent could therefore directly `UPDATE`/`DELETE` a finding —
severity of IA-FND-SKN-2026-000024 was changed from Medium to Low during test N5.

Fix (additive migration, no data change): `INSERT`/`UPDATE`/`DELETE` policies on
`ia_findings`, `ia_action_tracking`, `ia_activities`, `ia_follow_ups`,
`ia_audit_reports`, `ia_audit_closure`, `ia_plan_version_engagements` and
`ia_management_responses` now require `ia_can_access_engagement_internal()`.
Read policies are unchanged, so auditees keep visibility of released records, and
management responses continue to work because governed commands are SECURITY DEFINER.

Remediation: the tampered severity was restored to Medium and re-verified.
Retest N5 after the fix: denied, 0 rows affected.

## 3. Regression

| Gate | Result |
|---|---|
| `tsgo --noEmit` | PASS (0 errors) |
| Vitest `src/__tests__` | 5,856 passed / 3 failed / 314 files |
| Failure classification | All 3 failures are pre-existing Communication-Hub `psql` harness tests that call SECURITY DEFINER functions with the restricted sandbox DB role (`permission denied for function`). Unrelated to Internal Audit and to this wave's changes. |

## 4. Stop point

Plan B (50 engagements, FY2027) and Plan C have not been created. No production
deployment performed. Wave A is complete and Plan A is available as the prior-audit
history fixture for the next wave.
