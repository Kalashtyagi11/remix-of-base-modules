# IA Stage 2C — Authoritative Numbering & System Reference Convergence
**Date:** 2026-09-03 · **Defect:** DEF-E2E-009

## 1. Rebaseline (read-only)

- Starting HEAD: `5b05feff5` ("Fixed audit distribution add"), clean working tree.
- Commits since Stage 2B baseline (`c927b00ee`): reference-master ACL hardening and the
  plan-distribution grant fix. No Stage 2A/2B architecture changes.
- Baseline verified live:
  - Stage 2A fiscal master present (`core_fiscal_year`, 7 years), governed RPCs intact.
  - Stage 2B reference masters active: 25 values (Audit Type / Coverage Category / Follow-Up Type).
  - FY2032 plan `5dd6a953-663c-4e70-9c72-e3d72dd01571` — **Closed**, **20/20 terminal engagements**.
  - Fiscal-year / quarter derivation still governed by `zz_ia_engagement_fiscal_guard`.

## 2. Source census (before)

| Object | Reference | Generated where | Class | Stage 2C action |
|---|---|---|---|---|
| Engagement | `engagement_code` | `AuditEngagements.tsx` (`AUD-` + `Math.random`), `AddEngagementToPlanForm.tsx`, `EditEngagementDialog.tsx` (`ENG-` + `Math.random`) | **A** | **Converged this wave** |
| Finding | `finding_id` `FND-…` | `AuditFindingsTab.tsx`, `AuditActivitiesTab.tsx` (`Date.now`) | A | Later wave |
| Working paper | `working_paper_id` `WP-…` | `AuditWorkingPapersTab.tsx`, `AuditActivitiesTab.tsx` (`Date.now`) | A | Later wave |
| Evidence | `evidence_id` `EVD-…` / `WP-EV-…` | `AuditEvidenceTab.tsx`, `AuditActivitiesTab.tsx` | A | Later wave |
| Report | `report_number` `RPT-…` | `AuditReportTab.tsx`, `AuditReportBuilderStudio.tsx` | A | Later wave |
| Leave request | `request_id` `LR-…` | `AuditorLeaveManagement.tsx` | A (low value) | Later wave |
| Query attachments, evidence uploads | storage paths `${Date.now()}_${file}` | multiple tabs | **D** (not persisted identity) | No action |
| Court / statute / bank references | user input | — | **B** | No action |
| `id`, `*_id` UUID columns | `gen_random_uuid()` | DB | **C** | No action |

Other authoritative references requiring a later wave: **5** (Finding, Working Paper,
Evidence, Report, Leave Request). They require findings/reporting workflow work beyond
Stage 2C scope and are recorded, not converged here.

## 3. Migrations applied

1. Registered `INTERNAL_AUDIT` / `ENGAGEMENT` / `SKN` in `core_number_sequence`
   (`IA-ENG-SKN-{YYYY}-{SEQ}`, padding 6, YEARLY reset, active) — configurable by admins,
   no hardcoded prefix in code.
2. `public.ia_engagement_code_guard()` + trigger `zz_ia_engagement_code_guard`
   BEFORE INSERT OR UPDATE on `ia_audit_engagements`:
   - INSERT always allocates via `core_generate_number('INTERNAL_AUDIT','ENGAGEMENT','SKN',…)`;
     any browser-supplied code is discarded.
   - UPDATE rejects any change to `engagement_code` (`IA_ENGAGEMENT_CODE_IMMUTABLE`).
   - Server-only escape hatch (`ia.allow_code_override` GUC) for governed migration/backfill.
3. `engagement_code` set `NOT NULL`; unique index `ia_audit_engagements_code_uq`
   excluding the single documented legacy duplicate `ENG-2026-2027-001`.
4. Regression fix (see §7): `zz_ia_engagement_fiscal_guard` rewritten so a standalone
   engagement (no annual plan) no longer aborts on an unassigned record.
5. `REVOKE ALL` on both trigger functions from `PUBLIC`/`anon`/`authenticated`
   (trigger-only execution). Linter total returned to the pre-existing baseline **4027**.

## 4. Create-path convergence

All creation flows funnel through `useIACrud('ia_audit_engagements')` inserts, and every
insert path — Audits page, Add Engagement to Plan, Edit dialog create mode, planning
wizard, carry-forward, migration/seed helpers, direct REST — is numbered by the same
database trigger. Frontend generators removed:

- `src/pages/audit/AuditEngagements.tsx` — `generateEngagementCode()` deleted; payload no
  longer carries `engagement_code`; field shows "Assigned automatically on save".
- `src/components/audit/AddEngagementToPlanForm.tsx` — `generateCode()` deleted.
- `src/components/audit/EditEngagementDialog.tsx` — `generateCode()` deleted; create path
  sends no code; edit path never sends one.
- `src/config/autoCodeRegistry.ts` — `IA_ENGAGEMENT` registered as a system-code entity.

Post-remediation scan: client authoritative engagement-code generators = **0**;
`Math.random()` used for IA business numbering = **0**.

## 5. Security tests (live)

| Test | Result |
|---|---|
| Unauthenticated REST insert | **401 / 42501 permission denied** |
| Authenticated create supplying `engagement_code: "REST-FAKE-1"` | Accepted record, server code `IA-ENG-SKN-2026-000027` — fake value discarded |
| Authenticated PATCH `engagement_code` → `HACKED-REST` | **P0001 IA_ENGAGEMENT_CODE_IMMUTABLE** |
| Insert supplying an existing code (`IA-ENG-SKN-2026-000002`) | Ignored; new code `…000026` allocated |
| Direct DML update on `ia_audit_engagements` via non-governed role | permission denied (pre-existing IA governance retained) |

No IA permission was broadened for Stage 2C.

## 6. Concurrency / collision test

25 concurrent server-path inserts, each supplying a fake client code `CLIENT-FAKE-n`:

- Allocated: `IA-ENG-SKN-2026-000001` … `IA-ENG-SKN-2026-000025`
- **25/25 unique**, 0 duplicates, 0 browser-generated codes, 1 code per engagement,
  sequence internally consistent (`current_number = 27` after the two later probes).
- Test records terminally dispositioned via the governed API (`status = Cancelled`,
  `is_active = false`, scope annotated); retained as evidence, not deleted.

## 7. Defect discovered and retested

**DEF-2C-001 (Stage 2A regression):** `zz_ia_engagement_fiscal_guard` raised
`record "v_fy" is not assigned yet` for any engagement created without an annual plan,
blocking standalone/ad-hoc creation entirely. Fixed with an explicit `FOUND` flag and a
short-circuit return. Retest: 25/25 standalone creations succeeded; plan-linked
quarter/month derivation and the out-of-fiscal-year exception remain unchanged.

## 8. Historical reconciliation

- 105 pre-existing engagements: **0 renumbered, 0 rewritten**.
- Legacy prefixes preserved: `ENG:79`, `IA:20`, `W3:5`, `IT Department :1`.
- One legacy duplicate `ENG-2026-2027-001` (2 rows) preserved as a documented exception and
  surfaced through Configuration Health (IA-NUM-03).
- FY2032 closed plan untouched: **Closed · 20/20 terminal**.

## 9. Configuration Health

New card "Authoritative numbering checks (Stage 2C)" on `/audit` Configuration Health,
backed by `src/hooks/audit/useIaNumberingHealth.ts`:

| Code | Check | Result |
|---|---|---|
| IA-NUM-01 | IA engagement sequence registered and active | PASS |
| IA-NUM-02 | Duplicate codes excluding legacy exception | PASS (0) |
| IA-NUM-03 | Legacy duplicate retained | HISTORICAL (2) |
| IA-NUM-04 | Engagements without an authoritative code | PASS (0) |
| IA-NUM-05 | Post-cutover engagements not canonical | PASS (0) |
| IA-NUM-06 | Historical codes predating central numbering | HISTORICAL (105) |

## 10. Regression

- Stage 2A: fiscal master, governed RPCs, quarter derivation — PASS (plus DEF-2C-001 fix).
- Stage 2B: 25 active reference values, governed selectors, reference guards — PASS.
- FY2032 Phase-E: Closed · 20/20 — unchanged.
- Vitest (governance/template suites executed): 23/23 passed.
- Typecheck (`tsgo -p tsconfig.app.json`): clean.
- Build: clean.

## 11. Final HEAD

Working tree at time of certification: `5b05feff5` + Stage 2C changes
(4 migrations, 5 source files, 1 new hook, 1 evidence document).

---

STAGE 2C: PASS

DEF-E2E-009: CLOSED

CLIENT-GENERATED AUTHORITATIVE IA REFERENCES: 0 (engagement) · 5 other objects deferred

DUPLICATE ENGAGEMENT CODES: 1 (documented legacy exception, 0 new)

NEW ENGAGEMENTS WITHOUT CANONICAL CODE: 0

CONCURRENCY TEST: 25/25 UNIQUE

STAGE 2A REGRESSION: PASS

STAGE 2B REGRESSION: PASS

PHASE-E FY2032: Closed · 20/20

OTHER AUTHORITATIVE REFERENCES REQUIRING LATER WAVE: 5

READY FOR STAGE 2D: YES
