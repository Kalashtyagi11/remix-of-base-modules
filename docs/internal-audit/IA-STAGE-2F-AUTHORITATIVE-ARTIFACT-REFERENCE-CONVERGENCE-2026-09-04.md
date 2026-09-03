# Internal Audit — Stage 2F: Authoritative Artefact Reference Convergence

**Date:** 2026-09-04
**Rebaseline HEAD:** `7f8825c24c8b291545dc8b43c99285506b2033cf` (clean working tree)
**Defect:** DEF-E2E-014 — authoritative Internal Audit artefact references were generated in the browser
**Scope:** Finding · Working Paper · Evidence · Report · Leave Request

## 1. Rebaseline reconciliation

The diff since the Stage 2 closeout baseline contains 85 files. The only audit-named source change,
`src/services/auditPublicResponseService.ts`, belongs to **Compliance / Employer Audit (`ce_*`)**, not
Internal Audit, and only hoisted dynamic imports. The three post-closeout migrations contain no `ia_`
object references. **No intervening change alters Internal Audit architecture**; Stage 2A–2E and
IA-UX-VAL remain as certified, and FY2032 remains Closed · 20/20.

## 2. Identifier census and classification

| Object | Column | Rows | Pre-Stage-2F generator | Classification |
|---|---|---|---|---|
| Finding | `ia_findings.finding_id` | 51 | `ia_assign_finding_reference` (IA-local seq) + browser `FND-${Date.now()}` | Authoritative business reference |
| Working Paper | `ia_working_papers.working_paper_id` | 21 | `ia_assign_working_paper_reference` (IA-local seq) + browser `WP-${Date.now()}` | Authoritative business reference |
| Evidence | `ia_evidence.evidence_id` | 40 | browser `EVD-${Date.now()}` and `WP-EV-${Date.now()}` | Authoritative business reference — **one** entity, one sequence |
| Report | `ia_audit_reports.report_number` | 38 (28 null) | browser `RPT-${Date.now()}` | Authoritative business reference |
| Leave Request | `ia_leave_requests.request_id` | 1 | browser `LR-${Date.now()}` | Authoritative business reference (human-facing column in the register) |

**Not numbered (technical, correctly excluded):** storage object paths in `auditAttachmentUpload.ts`,
`AuditQueries.tsx`, `AuditResponsesTab.tsx`, logo upload paths in `FoundationSettingsEditor.tsx`,
template key suffixes in `auditPlanTemplateGovernance.ts`, and preview sample values in
`communicationMergePreview.ts`. Storage filenames are deliberately **not** given business numbers.

## 3. Convergence implemented

Central engine only — no Internal-Audit-specific numbering engine was created.

Registered in `core_number_sequence` (module `INTERNAL_AUDIT`, country `SKN`, padding 6, yearly reset):

| Entity type | Pattern |
|---|---|
| `FINDING` | `IA-FND-SKN-{YYYY}-{SEQ}` |
| `WORKING_PAPER` | `IA-WP-SKN-{YYYY}-{SEQ}` |
| `EVIDENCE` | `IA-EVD-SKN-{YYYY}-{SEQ}` |
| `REPORT` | `IA-RPT-SKN-{YYYY}-{SEQ}` |
| `LEAVE_REQUEST` | `IA-LR-SKN-{YYYY}-{SEQ}` |

- Single shared allocator `public.ia_artifact_reference_guard()` (SECURITY DEFINER, `search_path=public`,
  EXECUTE revoked from `PUBLIC`/`anon`/`authenticated`) assigns via `core_generate_number` on INSERT and
  raises `IA_REFERENCE_IMMUTABLE` on any attempt to change an allocated reference.
- **One active allocator per object:** triggers `zz_ia_assign_finding_reference` and
  `zz_ia_assign_working_paper_reference` were dropped. The legacy functions and their sequences remain in
  place, inactive, for rollback understanding only.
- Canonical-prefix partial unique indexes prevent duplicates among newly issued references
  (`ux_ia_*_canonical_reference` / `ux_ia_audit_reports_canonical_number`).
- `AUTO_CODE_REGISTRY` extended with `IA_FINDING`, `IA_WORKING_PAPER`, `IA_EVIDENCE`, `IA_REPORT`,
  `IA_LEAVE_REQUEST` (all `allowOverride: false`).

Browser generation removed from `AuditFindingsTab.tsx`, `AuditEvidenceTab.tsx`,
`AuditWorkingPapersTab.tsx`, `AuditActivitiesTab.tsx`, `AuditReportTab.tsx`,
`AuditReportBuilderStudio.tsx` and `AuditorLeaveManagement.tsx`. Reference inputs are now read-only and
show "Assigned automatically on save".

## 4. Historical preservation

No historical reference was renumbered, rewritten or deleted. All UUID primary keys and foreign-key
relationships are unchanged. Existing non-canonical values (13 `FND-*` + 38 other findings, 14 `WP-*`
+ 7 other working papers, 4 `EVD-*` + 36 other evidence, the duplicate group
`IA-TX-20260902-RPT-01 ×3`, 28 null report numbers, `IA-UT-20260902-LV-1`) remain exactly as recorded and
are reported as HISTORICAL by Configuration Health rather than treated as failures.

## 5. Proof executed (server side, disposable data only)

| Test | Result |
|---|---|
| Client-supplied `finding_id = 'CLIENT-CHOSEN-XYZ'` on insert | Ignored; server issued `IA-FND-SKN-2026-000001` |
| Update of an allocated `finding_id` | Rejected with `IA_REFERENCE_IMMUTABLE` |
| 21-way burst insert into `ia_evidence` | `IA-EVD-SKN-2026-000001` … `IA-EVD-SKN-2026-000021`, 21 distinct, 0 duplicates |
| Report insert without a number | `IA-RPT-SKN-2026-000001` |
| Leave request with client value `CLIENT-LR` | Ignored; `IA-LR-SKN-2026-000001` |
| Working paper insert with NULL reference | `IA-WP-SKN-2026-000001` |
| Test-data disposal | All proof rows deleted; 0 rows remain |

Traceability: every allocation is recorded in `core_number_sequence_audit`
(module `INTERNAL_AUDIT`, entity types above), providing full provenance.

## 6. Configuration Health

`useIaNumberingHealth` extended with `IA-NUM-07` (all five artefact sequences registered and active) and
`IA-NUM-08` … `IA-NUM-12` (per-artefact post-cutover canonical enforcement, historical counts reported
separately). Cutover date `2026-09-04`.

## 7. Regression

- `tsgo --noEmit -p tsconfig.app.json`: clean.
- Vitest `src/__tests__`: 5,856 passed, 3 pre-existing unrelated failures
  (`omni-comms/build4a-certification-mechanism`, `comm-hub/readinessReadOnly`,
  `tmp_findings_render` — a Compliance scaffold test missing a QueryClientProvider). None touch `ia_*`.
- No Stage 2A–2E object, RLS policy, RBAC grant or governed command was modified.

## Final status

```
STAGE 2F: PASS
DEF-E2E-009: CLOSED (Stage 2C)
DEF-E2E-014: CLOSED
FY2032 PLAN: Closed · 20/20 — unchanged
HISTORY: PRESERVED — 0 references renumbered
ALLOCATORS: 1 active per authoritative object
PRODUCTION READINESS: NOT ASSESSED — NOT DEPLOYED
NEXT WAVE: NOT STARTED
```
