# Internal Audit — Clean TEST Estate Reset (2026-09-04)

Wave scope: **reset + zero baseline only.** Plans A/B/C and the 60-engagement
E2E certification are deliberately **not** started in this wave.

Baseline evidence: `docs/internal-audit/IA-E2E-PRE-RESET-SNAPSHOT-2026-09-04.md`.

## 1. Mechanism selected

A fresh TEST database could not be provisioned from the delivery environment
(the Cloud TEST backend cannot be dropped and re-created from the build
sandbox). The **Section 4 in-place transactional reset** was therefore used,
with the Section 7 rule applied: immutable audit/event data was **preserved**,
not bypassed.

Governance was **not** disabled globally. The purge ran through one purpose-built,
confirmation-gated server-side operation:

```
public.ia_test_estate_purge(p_confirm text)  -- SECURITY DEFINER, service_role only
                                             -- token: IA-50E2E-20260904-RESET
```

Inside that single transaction, row guards were suspended **only** on the seven
purge-target tables and re-enabled before commit. `anon` and `authenticated`
have no EXECUTE privilege on the function.

## 2. Immutable evidence preservation

`ia_engagement_execution_log`, `ia_plan_change_log` and `ia_report_versions`
carry `ON DELETE CASCADE` FKs to the purge roots, so they were archived before
deletion into read-only archive tables (RLS on, SELECT-only for authenticated):

| Archive table | Rows preserved |
| --- | --- |
| `ia_archive_engagement_execution_log` | 195 |
| `ia_archive_plan_change_log` | 201 |
| `ia_archive_report_versions` | 33 |

`ia_audit_event` has no FK to the roots and was **not** deleted:

**PRESERVED IMMUTABLE IA EVENT ROWS: 1,328** (2026-08-27 → 2026-09-03)

`ia_approval_actions` (60) and `ia_comms_pre_release_quarantine` (8) likewise
remain as historical TEST evidence.

## 3. Purge result

| Metric | Before | After |
| --- | --- | --- |
| `ia_annual_plans` | 22 | **0** |
| `ia_audit_engagements` | 142 | **0** |
| `ia_findings` | 51 | **0** |
| `ia_audit_event` | 1,328 | 1,328 (preserved) |

Dependency-ordered deletion covered level‑3 → level‑2 → level‑1 children →
ownership-by-column tables → roots, exactly per the FK census in the snapshot.

## 4. Post-reset zero baseline (query-verified)

```text
plans                    0      qa_reviews            0
engagements              0      mgmt_responses        0
findings                 0      recommendations       0
working_papers           0      activities            0
evidence                 0      control_tests         0
reports                  0      plan_versions         0
actions                  0      comm_stages           0
follow_ups               0      carry_forward         0
engagement_execution_log 0      (archived: 195)
```

- OLD OPERATIONAL IA ANNUAL PLANS = **0**
- OLD OPERATIONAL IA ENGAGEMENTS = **0**
- ORPHAN IA TRANSACTIONAL CHILD ROWS = **0**
- STALE IA PENDING COMMUNICATION JOBS = **0**

## 5. Master / reference / configuration preserved

| Object | Count (unchanged) |
| --- | --- |
| `core_fiscal_year` | 7 |
| `core_number_sequence` (INTERNAL_AUDIT) | 6 |
| `ia_reference_value` | 27 (25 active) |
| `ia_departments` | 23 (13 active) |
| `ia_department_functions` | 55 (47 active) |
| `ia_auditors` | 14 |

### Numbering counters — deliberately NOT reset

| Entity | Prefix | Current number |
| --- | --- | --- |
| ENGAGEMENT | `IA-ENG-SKN` | 37 |
| FINDING | `IA-FND-SKN` | 21 |
| WORKING_PAPER | `IA-WP-SKN` | 21 |
| EVIDENCE | `IA-EVD-SKN` | 41 |
| REPORT | `IA-RPT-SKN` | 23 |
| LEAVE_REQUEST | `IA-LR-SKN` | 21 |

New references will continue from these values. Gaps are valid history.

## 6. Communication reconciliation

All pending Internal Audit communication work referenced deleted transactions
(`ia_audit_finding`, `ia_audit_engagement`, `ia_action`, `ia_annual_plan`,
`ia_follow_up`, `ia_audit_report`, `ia_document_request`).

| Action | Count |
| --- | --- |
| IA dispatch jobs cancelled (`ready` + `held`) | 216 |
| Related IA messages cancelled | 216 |
| Cancellation reason recorded | `IA-50E2E-20260904-RESET: source audit transaction removed in TEST estate reset` |
| Business event outbox pending | 0 (362 processed + 34 blocked retained as history) |

Delivery attempts, delivered messages and Omni-Comms audit evidence were **not**
deleted. No non-IA module was modified (Benefits outbox rows untouched).

## 7. Object storage

Manifest produced before any action: `/mnt/documents/ia-storage-manifest-pre-reset.txt`.

| Bucket | Objects | Disposition |
| --- | --- | --- |
| `ia-artifacts` | 38 (`plans/` 36, `plan-decisions/` 2) | orphaned by the purge — **removal deferred** |
| `audit-attachments` | 10 (`evidence/`, `queries/`, `responses/`, `working-papers/`) | orphaned by the purge — **removal deferred** |
| `audit-assets` (3), `audit-signatures` (2) | configuration/branding | retained by design |

**Deferred item (IA-50E2E-OBS-001, LOW):** physical deletion of the 48 orphaned
TEST objects requires the Storage API with a service role; direct deletion from
`storage.objects` is blocked by platform policy (`storage.protect_delete`), and
no service credential is available to the build environment. The objects are
unreachable from the application (all owning rows deleted) and fully inventoried
in the manifest. They do not affect the zero baseline or the new estate.

## 8. Health verdict

| Check | Result |
| --- | --- |
| Master/reference configuration | HEALTHY |
| Central numbering | HEALTHY (counters preserved, 6 sequences active) |
| Organisation integrity | HEALTHY (0 orphan department/function references — no transactional rows remain) |
| Workflow integrity | HEALTHY (no persisted workflow values remain to diverge) |
| Stage 2A–2F architecture | UNCHANGED |

## 9. Wave status

```text
INTERNAL AUDIT CLEAN RESET: PASS
OLD OPERATIONAL PLANS REMAINING: 0
OLD OPERATIONAL ENGAGEMENTS REMAINING: 0
ORPHAN TRANSACTIONAL ROWS: 0
STALE IA PENDING COMMUNICATION JOBS: 0
PRESERVED IMMUTABLE IA EVENT ROWS: 1328
PRESERVED ARCHIVED EVIDENCE ROWS: 429
ORPHANED TEST STORAGE OBJECTS (INVENTORIED, REMOVAL DEFERRED): 48
NEW IA INTEGRITY CRITICALS: 0
OPEN BLOCKER/CRITICAL IA DEFECTS: 0
NEXT WAVE: PLAN A — IA-E2E-PRIOR PRIOR-HISTORY FIXTURE (5 ENGAGEMENTS)
READY FOR PRODUCTION: NOT ASSESSED
```

Stopped here as instructed. No Production deployment.
