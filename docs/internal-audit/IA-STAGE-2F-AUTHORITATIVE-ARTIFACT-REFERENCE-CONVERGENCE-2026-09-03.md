# Internal Audit — Stage 2F: Authoritative Artefact Reference & Numbering Convergence

**Wave certification date:** 2026-09-03 (live re-proof) — implementation record also in
`IA-STAGE-2F-AUTHORITATIVE-ARTIFACT-REFERENCE-CONVERGENCE-2026-09-04.md`
**Starting HEAD:** `556765a72` (branch `development`, clean working tree)
**Final HEAD:** `556765a72` + this evidence document (no source or schema change required — convergence
already applied and now re-proved against the live server boundary)

## 1. Rebaseline

Commits since the Stage 2 closeout (`9127964f…` evidence-only) are `33d71b01e` (Benefits payment-schedule
maturation), `7485dbbeb`, `556765a72` (Draft annual-plan update fix). None touch Internal Audit numbering.
Stage 2A–2E and IA-UX-VAL configurations are unchanged; the historical organisation exception is unchanged.

## 2. Reference inventory (live)

| Object | Table | Business reference column | Current generator | Browser/Server | Unique | Immutable | Historical formats | Stage 2F action |
|---|---|---|---|---|---|---|---|---|
| Finding | `ia_findings` | `finding_id` | `core_generate_number` via `ia_artifact_reference_guard` | Server | Yes (canonical partial UQ) | Yes | `FND-*`, free text | CONVERGED |
| Working Paper | `ia_working_papers` | `working_paper_id` | same | Server | Yes | Yes | `WP-*`, free text | CONVERGED |
| Evidence | `ia_evidence` | `evidence_id` | same | Server | Yes | Yes | `EVD-*`, `WP-EV-*` | CONVERGED — one canonical identity |
| Report | `ia_audit_reports` | `report_number` | same | Server | Yes | Yes | `IA-TX-…-RPT-01` ×3, 28 NULL | CONVERGED |
| Leave Request | `ia_leave_requests` | `request_id` | same | Server | Yes | Yes | `IA-UT-20260902-LV-1` | CONVERGED (Class A — human-visible "Request ID"; UUID `id` remains the PK) |

Class D/E exclusions confirmed by census: storage paths in `AuditEvidenceTab`, `AuditActivitiesTab`,
`AuditQueries`, `AuditResponsesTab`, logo uploads in `FoundationSettingsEditor`; date arithmetic in
`TimeTracking`, `EngagementDetail`, `RiskRegister`, `AuditTimelineTab`. No storage filename is business-numbered.

## 3. Central sequences (verified live, `core_number_sequence`)

`INTERNAL_AUDIT` / `SKN`, all `is_active = true`:
`ENGAGEMENT → IA-ENG-SKN`, `FINDING → IA-FND-SKN`, `WORKING_PAPER → IA-WP-SKN`,
`EVIDENCE → IA-EVD-SKN`, `REPORT → IA-RPT-SKN`, `LEAVE_REQUEST → IA-LR-SKN`
(`{YYYY}-{SEQ}`, padding 6, yearly reset). Prefix templates live in configuration, not in application code.

## 4. Allocators — exactly one active per object

Triggers bound to `ia_artifact_reference_guard()` (INSERT + UPDATE) on all five tables:
`zz_ia_finding_reference_guard`, `zz_ia_working_paper_reference_guard`, `zz_ia_evidence_reference_guard`,
`zz_ia_report_number_guard`, `zz_ia_leave_request_reference_guard`.
The legacy allocators `ia_assign_finding_reference` / `ia_assign_working_paper_reference` have **no bound
trigger**; the sequences `ia_finding_ref_seq`, `ia_working_paper_ref_seq` remain as inactive legacy objects
with no producer (retained for rollback understanding, per §22).

## 5. Live proofs executed this wave

| Test | Result |
|---|---|
| 20-way concurrent insert, Finding, each supplying `finding_id = 'CLIENT-FAKE'` | 20 rows, 20 distinct, 20 canonical `IA-FND-SKN-…` — client value ignored |
| 20-way concurrent insert, Working Paper (client value supplied) | 20 / 20 distinct / 20 canonical |
| 20-way concurrent insert, Evidence (client value supplied) | 20 / 20 distinct / 20 canonical |
| 20-way concurrent insert, Report (client value supplied) | 20 / 20 distinct / 20 canonical |
| 20-way concurrent insert, Leave Request (client value supplied) | 20 / 20 distinct / 20 canonical |
| Immutability: privileged `UPDATE ia_findings SET finding_id = … ` | Rejected: `IA_REFERENCE_IMMUTABLE: FINDING reference cannot be changed after allocation` |
| Duplicate scan on canonical references (all five objects) | 0 duplicates |
| Test-record disposal | 100 proof rows removed; historical counts unchanged (51 findings, 21 WPs, 40 evidence, 40 reports, 1 leave) |

Sequence consumption during the proof is recorded in `core_number_sequence_audit` (non-gapless by design).

## 6. Historical preservation

0 historical references renumbered, rewritten or deleted. Legacy `FND-*`, `WP-*`, `EVD-*`, `WP-EV-*`,
`IA-TX-…-RPT-01` (×3) and 28 NULL report numbers remain exactly as recorded and are reported as
HISTORICAL / INFO by Configuration Health (`useIaNumberingHealth`, checks `IA-NUM-07` … `IA-NUM-12`,
cutover boundary 2026-09-04), never as CRITICAL.

## 7. Source census after remediation

Client-generated authoritative IA references: **0**. Table-local authoritative sequences with an active
producer for converged objects: **0**. Remaining `Date.now()` / `Math.random()` hits under
`src/pages/audit`, `src/components/audit`, `src/hooks/audit` are all Class D (storage keys) or Class E
(date arithmetic / display). `WP-` hits in `weeklyPlanService.ts` and `inspectionService.ts` belong to
Compliance weekly plans, not Internal Audit.

## 8. Regression

- FY2032: plan **Closed**, 20 engagements, all `Closed` — **20/20**, unchanged.
- Internal Audit Vitest suite: 23 passed / 23.
- `tsgo --noEmit -p tsconfig.app.json`: clean. Build: `build OK`.
- Pre-existing Communication Hub / Compliance drift is unrelated to Stage 2F and remains open.

## 9. External production-readiness observations (not Stage 2F defects)

1. Platform IP-access fail-open behaviour.
2. Communication Hub regression drift.

## Final status

```
STAGE 2F — AUTHORITATIVE ARTIFACT REFERENCE CONVERGENCE: PASS
FINDING REFERENCE: CONVERGED
WORKING PAPER REFERENCE: CONVERGED
EVIDENCE REFERENCE: CONVERGED
REPORT REFERENCE: CONVERGED
LEAVE REQUEST REFERENCE: CONVERGED
ACTIVE AUTHORITATIVE NUMBER ALLOCATORS: 5/5
CLIENT-GENERATED AUTHORITATIVE IA REFERENCES: 0
NEW RECORDS WITHOUT AUTHORITATIVE REFERENCE: 0
NEW DUPLICATE AUTHORITATIVE REFERENCES: 0
ORDINARY RENUMBER BYPASSES: 0
HISTORICAL REFERENCES REWRITTEN: 0
NUMBERING CONCURRENCY: PASS
STAGE 2A REGRESSION: PASS
STAGE 2B REGRESSION: PASS
STAGE 2C REGRESSION: PASS
STAGE 2D REGRESSION: PASS
STAGE 2E REGRESSION: PASS
IA MULTI-TAB VALIDATION UX REGRESSION: PASS
PHASE-E FY2032: Closed · 20/20
EXTERNAL PRODUCTION-READINESS OBSERVATIONS: 2
READY FOR POST-STAGE-2F IA CERTIFICATION: YES
READY FOR PRODUCTION: NOT ASSESSED
```
