# IA Master & Reference Data Integrity — Findings and Remediation Design

Date: 2026-09-02 · Stage: DISCOVERY COMPLETE, REMEDIATION NOT YET IMPLEMENTED
Baseline preserved: Phase-E 20/20, FY2032 plan `Closed`.

Companion documents:
- `IA-MASTER-REFERENCE-DATA-REGISTER-2026-09-02.md` (classification register)
- `IA-MASTER-DATA-LIVE-RECONCILIATION-2026-09-02.md` (live data scan)
- `IA-PHASE-E-MASTER-DATA-RETROSPECTIVE-2026-09-02.md` (FY2032 provenance)
- `IA-CONFIGURATION-HEALTH-MATRIX-2026-09-02.md` (diagnostics design)

## Defect register

| ID | Severity | Title | Evidence |
|---|---|---|---|
| **DEF-E2E-006** | HIGH | Fiscal Year master referential integrity missing | No fiscal-year table exists platform-wide; `AnnualPlanForm.tsx:31` generates the selectable years from `new Date().getFullYear()`; 18/18 plans store unvalidated text across 3 formats |
| **DEF-E2E-007** | HIGH | Audit / Engagement Type has three divergent hardcoded lists and no server validation | `AuditEngagements.tsx:29`, `AddEngagementToPlanForm.tsx:15`, `EditEngagementDialog.tsx:20`; 36/103 live rows hold values no UI can produce |
| **DEF-E2E-008** | HIGH | Coverage Category unvalidated and semantically polluted | 46/103 rows contain risk bands (High/Critical/Medium) in `coverage_category`; only 1 row matches the screen's own list |
| **DEF-E2E-009** | HIGH | Authoritative engagement references generated client-side | `ENG-${date}-${Math.floor(1000+Math.random()*9000)}` in three components; collision-prone, non-deterministic, contradicts `docs/architecture/auto-code-standards.md` |
| **DEF-E2E-010** | MEDIUM | Fiscal quarter manually selected instead of derived | `quarter TEXT` set by dropdown; no cross-check against `planned_start_date`; fiscal-calendar-agnostic |
| **DEF-E2E-011** | MEDIUM | Orphan department reference on an active engagement | `6311e399-1692-4085-bc6d-f474da2fd2a1` points to a non-existent department; no FK constraint present |
| **DEF-E2E-012** | MEDIUM | Duplicated workflow-status constants across 7+ components | Status vocabularies re-declared per screen; risk of UI/server divergence |

### Explicitly NOT defects (architectural convergence observations)

- Risk band vocabulary (Critical/High/Medium/Low) is hardcoded in four screens
  but is an immutable canonical vocabulary already owned by
  `ia_risk_classification_thresholds`. Converge the imports; do not create a master.
- Lifecycle stage lists are governed workflow vocabulary (class C), not
  administrator-maintainable master data.
- Fonts, colours, merge fields and MIME allow-lists are presentation constants.

## Remediation design (proposed, not yet applied)

1. **Fiscal Year master (enterprise).** New `core_fiscal_year`
   (`code`, `name`, `start_date`, `end_date`, `status`, `is_active`,
   `planning_allowed`, `organisation_id`, audit columns) plus an administration
   screen and governed create command. `ia_annual_plans.fiscal_year_id UUID FK`
   added; existing `fiscal_year` text demoted to display snapshot. Server
   commands reject unknown, inactive, wrong-organisation and closed years.
   Backfill is **additive only** — closed historical plans keep their text and
   a nullable id.
2. **IA reference masters.** `ia_reference_value`-style governed tables (or one
   typed reference table with `reference_type`) for Audit Type, Coverage
   Category and Follow-Up Type, following the existing `ia_activity_types`
   pattern: code, name, description, is_active, display_order, audit columns;
   deactivate rather than delete.
3. **Server allow-lists.** Every IA command that accepts a classification
   validates against the reference table and returns a deterministic denial code
   (`IA_UNKNOWN_REFERENCE`, `IA_INACTIVE_REFERENCE`, `IA_INVALID_PARENT`).
4. **Quarter derivation.** Compute from the selected fiscal year's calendar and
   `planned_start_date`; the manual selector becomes read-only derived output.
5. **Server-side references.** Register `IA_ENGAGEMENT`, `IA_FINDING`,
   `IA_WORKING_PAPER`, `IA_ACTION`, `IA_REPORT` in `AUTO_CODE_REGISTRY` /
   `core_number_sequence` and remove the three client generators.
6. **Constant convergence.** One `src/config/auditVocabulary.ts` contract
   consumed by all IA screens and mirrored by server state machines.
7. **Configuration Health screen.** See the matrix document.
8. **Historical tolerance.** Inactive/legacy references remain readable
   everywhere; only NEW transactions are denied.

## Certification position at end of Stage 1

| Gate | Status |
|---|---|
| PHASE-E LIFECYCLE CERTIFICATION | **PASS** (unchanged, 20/20, FY2032 closed) |
| MASTER & REFERENCE DATA INTEGRITY | **FAIL** — 7 evidence-proven defects, 4 HIGH |
| OBS-E2E-D (legacy Comm-Hub static-source drift) | **OPEN**, unchanged, unrelated to this wave |
| FUNCTIONALLY READY FOR PRODUCTION-READINESS ASSESSMENT | **NO** |
| READY FOR PRODUCTION | NOT ASSESSED |
