# Internal Audit — Management Reporting No-Hardcoding / Configuration Convergence Gate

Environment: TEST (`xynceskeiiisiefqlgxo`). Production untouched. No TEST data reset.

## 1. Hardcoding inventory

| Item | Previous location | Classification | Resolution |
|---|---|---|---|
| Engagement progress stage weights | `ia_engagement_status_model` literals | BUSINESS RULE | `ia_report_methodology` `PROGRESS` (versioned, seeded v1) |
| Control-test / working-paper / response evidence weights | same | BUSINESS RULE | `PROGRESS` methodology config |
| Schedule At-Risk tolerance (14 days) | same | BUSINESS RULE | `SCHEDULE` methodology config |
| Forecast tolerance | live status function | BUSINESS RULE | `SCHEDULE` methodology config |
| Plan Health thresholds and scoring | `ia_management_status_live` | BUSINESS RULE | `PLAN_HEALTH` methodology config (rules, bands, attention severities) |
| Critical / High severity assumptions | SQL literals | MASTER DATA | `PLAN_HEALTH` attention severity list + IA reference values |
| Management report audiences | frontend array | MASTER DATA | `ia_reference_value` type `MANAGEMENT_REPORT_AUDIENCE` |
| Reporting period presets | frontend array | MASTER DATA | `ia_reference_value` type `MANAGEMENT_REPORT_PERIOD`; boundaries from governed Fiscal Calendar |
| Report modes | frontend array | DEFAULT CONFIGURATION | `ia_report_definition` (4 active definitions) |
| Report section order / headings / page breaks | PDF builder | BUSINESS RULE | `ia_report_definition_section` (48 rows) resolved at render time |
| PDF KPI columns / labels / formats | PDF builder | BUSINESS RULE | `ia_report_metric` registry (10 enabled) with `source_path` + `formatter` |
| Country / organisation code in numbering | `SKN` literal | CUSTOMER/ORG VALUE | resolved from `core_organization` country at allocation time |
| Report prefix construction | numbering guard | DEFAULT CONFIGURATION | report definition + central sequence |
| Branding (letterhead, colours, confidentiality) | `DEFAULT_AUDIT_BRANDING` | CUSTOMER/ORG VALUE | `ia_org_document_foundation` via `useDocumentFoundation()` / `brandingFromFoundation()`; the constant remains only as a last-resort render fallback |
| jsPDF page geometry, table themes, date ISO format | PDF builder | SAFE PRESENTATION CONSTANT | retained |
| Payload key names, RPC names, path traversal | code | SOFTWARE INVARIANT | retained |

## 2. Runtime resolution

- `managementStatusReportService.fetchManagementReportingConfiguration()` reads audiences, periods, report definitions, sections, metrics and active methodologies at runtime.
- `ManagementStatusPanel` initialises every selector from configuration, derives department scoping from `permitted_scope`, renders KPI cards from the metric registry, and filters sections by configured visibility and audience.
- `ManagementStatusReportPDFExport` renders sections by configured key/order/heading/page-break, KPI columns from the metric registry, and branding from the Document Foundation. A `Basis of Preparation` section prints the configuration provenance.
- Sealed report distribution renders from `config_provenance` recorded at generation time, never from today's configuration.

## 3. Governance

- Writes only through `ia_report_save_methodology_draft`, `ia_report_validate_methodology`, `ia_report_activate_methodology`, `ia_report_configure_section`, `ia_report_configure_metric`, all gated by `ia_can_manage_reporting_config()`.
- Every change recorded in `ia_report_config_audit` (entity, action, before/after, actor, reason).
- Methodology versions are immutable once used (`ia_report_version_immutable`); activation creates a new active version.
- UI: `/audit/settings/reporting-configuration` (Methodologies, Report structure, Metric registry, Change history).

## 4. Acceptance

| Line | Result |
|---|---|
| CUSTOMER DATA HARDCODED IN RUNTIME | NO |
| CUSTOMER/COUNTRY CODE HARDCODED | NO |
| REPORT STRUCTURE HARDCODED | NO |
| PROGRESS RULES HARDCODED | NO |
| PLAN HEALTH RULES HARDCODED | NO |
| SCHEDULE THRESHOLDS HARDCODED | NO |
| AUDIENCE MASTER HARDCODED | NO |
| FISCAL PERIODS HARDCODED | NO |
| REPORT METRICS CONFIGURABLE | PASS |
| REPORT SECTIONS CONFIGURABLE | PASS |
| METHODOLOGY VERSIONING | PASS |
| CONFIGURATION AUDIT TRAIL | PASS |
| HISTORICAL SNAPSHOT IMMUTABILITY AFTER CONFIG CHANGE | PASS (sealed snapshots render from recorded provenance; sealed rows protected) |
| BUSINESS BACKEND WORKAROUNDS | 0 |

Existing Golden Audit, sealed reports, snapshots and communications preserved. Typecheck and build pass.
