# Internal Audit — Management Reporting End-to-End Integrity Gate

Environment: TEST (`xynceskeiiisiefqlgxo`). Production untouched. No TEST reset. Golden Audit, sealed
reports, Management Status snapshots, communications and prior evidence preserved.

Repository baseline at start of gate: HEAD `be5760480` (*Configured reporting gate*).

## 1. Architecture

One calculation engine, reused end to end. No second reporting engine was introduced.

```text
canonical transactions
  ia_audit_universe / ia_annual_plans / ia_audit_engagements
  ia_findings / ia_management_responses / ia_action_tracking / ia_follow_ups
  ia_plan_amendments / ia_audit_reports / ia_audit_event (dated event ledger)
        |
        v
  ia_engagement_status_model(plan, as_at, department)      canonical engagement lifecycle
        |
        v
  ia_management_status_live  ->  ia_management_status_live_v2
        (cumulative position)      (+ period movement, denominators, date basis,
                                      coverage, themes, outlook, data quality)
        |
        +-- ia_management_status_drilldown()   record-level reconciliation
        +-- ia_management_data_quality()       reporting-critical exceptions
        |
        v
  ia_generate_management_status_report()  -> DRAFT + sealed evidence capture
  ia_issue_management_status_report()     -> ISSUED / Sealed + official number
        |
        v
  ia_management_status_report(+_evidence)  ->  PDF artifact  ->  Omni-Comms distribution
```

Frontend: `src/services/audit/managementStatusReportService.ts`,
`src/components/audit/reports/managementStatus/ManagementStatusPanel.tsx`,
`src/utils/audit/ManagementStatusReportPDFExport.ts`. The browser performs no aggregation,
no numbering and no threshold logic.

## 2. Defects found at rebaseline

| ID | Defect | Resolution |
|---|---|---|
| IA-FULL-E2E-024 | Reports were sealed the instant they were generated — no draft stage, so any authorised viewer effectively issued an official report | Draft → Issued lifecycle; `status` constraint extended to `Draft` |
| IA-FULL-E2E-025 | No separation between "may generate" and "may issue"; report generation used the plan **view** permission | `ia_can_generate_management_report()` and `ia_can_issue_management_report()`; issue is a distinct authority and is *not* implied by reporting-configuration permission |
| IA-FULL-E2E-026 | No record-level traceability — headline counts were dead numbers | `ia_management_status_drilldown()` for 19 KPI codes; clickable KPI cards |
| IA-FULL-E2E-027 | An issued report could silently change as findings closed or dates moved, because only the payload (not the underlying records) was retained | `ia_management_status_report_evidence` captured at generation, frozen at issue, RLS + immutability trigger; drill-down on an issued report resolves from sealed evidence |
| IA-FULL-E2E-028 | Weak date semantics — several period metrics keyed off generic `created_at` | Explicit per-metric date basis (see §4), published in the payload as `period_date_basis` |
| IA-FULL-E2E-029 | Percentages rendered as 0% / green when the denominator was zero or unavailable | Denominators published and rendered; empty populations report "No applicable records" |
| IA-FULL-E2E-030 | No surface for reporting-critical data-quality conditions; bad rows were simply invisible | `ia_management_data_quality()` + Data Quality tab |
| IA-FULL-E2E-031 | Drill-down draft contained hard-coded progress thresholds and schedule labels | Resolved from `PROGRESS` / `SCHEDULE` governed methodology (`in_progress_min_pct`, `in_progress_max_pct`, `at_risk_labels`) with last-resort defaults only |
| IA-FULL-E2E-032 | Drill-down referenced a non-existent `ia_action_tracking.responsible_name` (HTTP 400 on generate) | Corrected to the canonical `responsible_person` |

## 3. KPI lineage — source, formula, denominator, date basis, drill-down

| KPI | Source | Formula / denominator | Date basis | Drill-down |
|---|---|---|---|---|
| Plan completion | `ia_engagement_status_model` | average engagement progress ÷ engagements in scope; `Not applicable` when scope = 0 | as-at position | yes (`approved_engagements`) |
| Schedule adherence | same | engagements with a configured on-track schedule label ÷ engagements in scope | as-at position | yes (`delayed_at_risk`) |
| Engagements by lifecycle | `ia_audit_engagements` via canonical model | canonical lifecycle only — no reporting-only status list | lifecycle state as at | yes (per state) |
| Audits started | engagements | count in period | `actual_start_date` | yes |
| Audits completed | engagements | count in period | `closure_date`, fallback `actual_end_date` | yes |
| Audits cancelled / carried forward | `ia_audit_event` | count in period | `IA.ENGAGEMENT.CANCELLED` / `...CARRIED_FORWARD` occurrence | yes |
| Audits rescheduled | engagement schedule history | count in period | schedule-history date | — |
| Findings raised | `ia_findings` | count in period | `created_date` (fallback `created_at::date`) | yes |
| Findings closed | `ia_audit_event` | count in period | `IA.FINDING.CLOSED` occurrence | yes |
| Open Critical/High findings | `ia_findings` | severity ∈ governed Critical/High and not closed | as-at position | yes |
| Overdue management responses | findings + `ia_management_responses` | due date passed and no current response | `response_due_date` | yes |
| Actions created | `ia_action_tracking` | count in period | action created date | yes |
| Actions management-completed | actions | count in period | `management_completion_date` — **not** treated as closure | yes |
| Actions verified | actions | count in period | audit `verification_date` / `verified_at` | yes |
| Actions overdue | actions | target date passed and not closed/verified/cancelled | `current_target_date`, fallback `target_date` | yes |
| Extensions requested / approved | `ia_audit_event` | count in period | `IA.ACTION.EXTENSION_REQUESTED` / `..._APPROVED` | — |
| Follow-ups completed | `ia_follow_ups` | count in period | verification / resolution date | — |
| Plan amendments approved | `ia_plan_amendments` | count in period | amendment approval date | — |
| Universe coverage | `ia_audit_universe` | entities with an engagement in the plan ÷ active universe entities | as-at | yes |
| High-risk unscheduled | universe | Critical/High entities with no non-cancelled engagement in the plan | as-at | yes |
| Overdue by audit frequency | universe | `next_audit_due` passed with no completed audit since | `next_audit_due` | yes |

Management's own "completed" is never reported as audit closure; verified/closed states derive from the
governed verification workflow.

## 4. Lifecycle, ratings and period logic

- Report status derives solely from the canonical engagement lifecycle (`ia_engagement_status_model`);
  no duplicate reporting-only status vocabulary exists.
- Rating families are kept separate and are never merged: engagement/audit rating, finding severity,
  entity risk rating, control effectiveness, report opinion.
- Periods (`Q1..Q4`, monthly, YTD, custom, current) are bounded by `ia_management_period_bounds()`,
  which derives quarter and year boundaries from the governed Fiscal Calendar (`core_fiscal_year`).
- Every report distinguishes **period movement** from **cumulative position as at**.
- Historical reconstruction is honest: dated business events are replayed; current-state-only fields
  (present lifecycle, risk, capacity) are labelled as such in the temporal-fidelity note, and the
  issued IA-MSR report remains the authoritative historical position.

## 5. Scope filtering and access control

- Department scoping uses the canonical `department_id` relationship, never display labels.
- View: `ia_can_view_annual_plan(plan)` (department-scoped).
- Generate draft: `ia_can_generate_management_report(plan)`.
- Issue / seal: `ia_can_issue_management_report(plan)` — a distinct authority; reporting-configuration
  permission does not confer it (asserted by the test suite).
- Configure: `ia_can_manage_reporting_config()` (unchanged from the previous gate).
- All reporting functions are revoked from `anon` and `PUBLIC`.

## 6. Report states

| State | Meaning | Behaviour |
|---|---|---|
| A. Live view | on-screen status | recalculated on every load; never authoritative history |
| B. Draft report | `lifecycle_state = Draft`, temporary `IA-MSR-DRAFT-…` reference | evidence captured; may be discarded; **cannot be distributed** |
| C. Issued report | `lifecycle_state = Issued`, `status = Sealed`, official `IA-MSR-SKN-YYYY-NNNNNN` | payload, configuration provenance and record evidence frozen; distribution enabled |

An issued report therefore cannot change when a finding is later closed, a due date moves, a rating
changes, an action is reopened, organisation master data changes, or reporting configuration is
re-versioned. Only a governed report-instance/evidence model is snapshotted — not the database.

## 7. Empty, partial and poor-quality data

- Zero denominators render as `Not applicable`, never a green 0%.
- Empty populations render "No applicable records", including in drill-down.
- Data Quality tab surfaces: finding without owner, missing required due date, engagement without a
  report issue date, closed finding without closure/verification evidence, invalid lifecycle
  combinations and inconsistent plan relationships. Such rows are **surfaced, not excluded**.

## 8. Changes and migrations

Database (TEST):
1. Report lifecycle columns + backfill of prior sealed rows as `Issued`; `ia_msr_status_chk` extended to `Draft`.
2. `ia_management_status_report_evidence` (+ RLS, immutability trigger, cascade-protected by the report guard).
3. `ia_can_generate_management_report`, `ia_can_issue_management_report`.
4. `ia_management_status_drilldown`, `ia_management_data_quality`.
5. `ia_management_status_live_v2` extended with denominators, date basis, coverage and data quality.
6. `ia_generate_management_status_report` → Draft + evidence capture; `ia_issue_management_status_report` → issue/seal + official numbering + `IA.REPORT.ISSUED`.

Application: service wrappers and types (`DrilldownRecord`, `DataQualityException`, lifecycle fields,
`DRILLABLE_KPI_CODES`); panel gains clickable KPI cards with a drill-down dialog, a Data Quality tab
with measurement basis, Draft/Issued state, an Issue action limited to issue authority, and
distribution restricted to issued reports.

## 9. Evidence

Browser-verified in TEST on the FY2030 Golden plan:

- Live position: plan completion 95%, schedule adherence 100%, 0 open Critical/High findings, 0 overdue actions.
- Drill-down opened from a KPI card and resolved under the same reporting rules ("No applicable records" where the population is genuinely empty).
- Data Quality tab listed the measurement basis for every metric and reported no exceptions for the plan.
- Generation produced `IA-MSR-DRAFT-1538750386` in state **Draft** with distribution disabled.
- Issuing produced official `IA-MSR-SKN-2026-000003`, state **Issued**, with **9 sealed evidence records across 8 KPIs**.
- Empty-plan case (FY2026): 0 engagements in scope reported honestly, with no fabricated percentages.
- Prior reports `IA-MSR-SKN-2026-000001/2` preserved unchanged.

Deterministic suite: `supabase/tests/sql/internal-audit-management-reporting-integrity.sql`
(lifecycle separation, distinct issue authority, no anon/PUBLIC execution, evidence RLS and
immutability, issued-report immutability, canonical-engine reuse, governed thresholds, published date
basis and denominators).

Build and typecheck pass. No demo or fake production data was added.

## 10. Residual risks

- The project-wide security linter baseline (4,071 findings, unchanged by this gate) remains open and
  is unrelated to management reporting.
- PDF rendering keeps a last-resort default section list for the case where no report definition is
  configured at all.
- Historical reconstruction before an issued report exists is limited to dated events, by design.

## 11. Verdict

| Line | Result |
|---|---|
| REPORTING DERIVED FROM CANONICAL LIFECYCLE | PASS |
| NO PARALLEL REPORTING ENGINE | PASS |
| KPI DRILL-DOWN RECONCILIATION | PASS |
| DATE BASIS CORRECTNESS | PASS |
| ZERO-DENOMINATOR HONESTY | PASS |
| DATA QUALITY SURFACED | PASS |
| DRAFT / ISSUED SEPARATION | PASS |
| ISSUED REPORT HISTORICAL REPRODUCIBILITY | PASS |
| RBAC SEPARATION (GENERATE / ISSUE / CONFIGURE) | PASS |
| EMPTY AND PARTIAL DATA HANDLING | PASS |
| BUSINESS BACKEND WORKAROUNDS | 0 |

**IA MANAGEMENT REPORTING END-TO-END INTEGRITY GATE: PASS**
