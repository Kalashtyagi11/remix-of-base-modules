# IA-METHODOLOGY-PROGRAMME-EXECUTION-TEMPLATE-UX-INTEGRITY-GATE

Status: **IN PROGRESS — Phase 0/1 complete (rebaseline + impact matrix). No schema or code changes made yet.**

## 1. Starting HEAD

`cf951c99648ba6accd8a4ed2693809fe4ae5bc91` ("Work in progress"), clean working tree.

## 2. Final HEAD

_Pending — recorded at gate completion._

## 3. Migration baseline

- 1,998 migrations under `supabase/migrations/`; latest `20260904200403_415dfab9-…`.
- TEST database (ref xynceskeiiisiefqlgxo) holds **135 `ia_*` tables**.
- Several execution-layer tables (`ia_audit_programs`, `ia_rcm_*`, `ia_control_tests`, `ia_control_test_results`) predate tracked migration history; structure verified from the generated Supabase types and live `information_schema`.

## 4. Current architecture found

### 4.1 Engagement spine (LIVE, canonical)
`ia_audit_engagements` is the live execution spine: objectives/scope/criteria/methodology free text, team (`lead_auditor_id`, `team_member_ids`, `supportive_auditor_ids`, `reviewer_id`), `execution_status` driving a lifecycle stepper, execution gates, closure gate RPC `ia_evaluate_engagement_closure`, RLS helpers `ia_can_access_engagement*`, `ia_can_start/close_engagement`.

### 4.2 RCM / execution layer
- `ia_rcm_processes → ia_rcm_risks → ia_rcm_controls` is a live shared master tree (built in `AuditProgrammeRcmTab.tsx`, scoped by department/function).
- `ia_rcm_tests` (control → template test procedure) exists in schema but has **zero UI/hook consumers** — dead.
- `ia_control_tests` is the engagement-bound executed test (engagement_id + rcm_control_id), concluded only via governed RPC `ia_conclude_control_test` (requires conclusion; if `exceptions_found > 0` and no linked finding, requires `no_finding_rationale` — error `IA_RATIONALE_REQUIRED`).
- `ia_control_test_results` (per-sample-item rows: `test_item_no`, `sample_reference`, `result`, `observation`, `exception_detail`) exists but is **code-dead** — no UI or hook reads/writes it.
- `ia_audit_programs` + `ia_audit_procedures` (programme template with `version`, `approved_by`, JSON link blobs) are **orphaned** — one generic CRUD hook, no consumers.
- `ia_control_effectiveness_levels` is a governed master (Effective/Partially/Ineffective → reduction %).

### 4.3 Evidence / working papers
- `ia_evidence`: canonical evidence record (`evidence_id` business ref, file metadata, `hash` column present **but never written** by any upload path). Link columns: engagement, activity, finding, department_audit, annual_plan. No link to control test, sample item, exception, or working paper (working papers link evidence via `evidence_ids[]` array).
- Two divergent upload paths: `AuditEvidenceTab` (direct bucket upload, `window.open(file_url)` — broken for the private bucket) vs `AuditWorkingPapersTab` (canonical `uploadAuditAttachment` + signed URLs + compensating rollback).
- `ia_working_papers`: rich schema (objective, procedure, test_performed, results, observations, conclusion, prepared/reviewed/approved-by+dates, version, evidence_ids[], linked_finding_ids[]) — **UI captures only title/description/area/attachments**; professional fields are UI-dead.

### 4.4 Findings chain (MATURE — preserve)
`ia_findings` (5 C's, severity with `ia_finding_severity_history` change control, full lifecycle reviewed→confirmed→released/withdrawn, dispute handling) → `ia_recommendations` (suggested vs official target dates) → `ia_management_responses` (versioned, management position vs IA conclusion, dispute escalate/dispose RPCs) → `ia_action_tracking` (management completion ≠ IA verification; `requires_ia_verification`, extension/reopen counts) → `ia_follow_ups`. Findings can link `control_test_id`, `checklist_id`, `activity_id` — but **no risk/objective FK**.

### 4.5 Supervisory review
`ia_quality_reviews` + `ia_quality_review_checklist` via `ia_start/conclude_quality_review`; review-level lifecycle only — **no per-note Open→Response→Cleared lifecycle**. Working-paper preparer/reviewer segregation unenforced in UI.

### 4.6 Templates
See §17 inventory. Modern governed pipeline exists for document output (foundation → section library → template settings) and audit plan templates (full draft→published→archived governance in `auditPlanTemplateGovernance.ts`). Checklist/distribution/mitigation templates have no lifecycle. `ia_document_templates` legacy editor (`TemplatesManagement.tsx`) is deprecated, orphaned from the sidebar, still route-registered.

### 4.7 Daily UX
- Engagement workspace = **14 flat tabs** (Overview, Preparation, Programme/RCM, Activities, Control Tests, Evidence, Working Papers, Findings, Responses, Actions, Follow-ups, Quality Review, Timeline, Closure) — stage-aware alerts and next-actions exist (`deriveNextActions`, `SmartAlertsBanner`) but all tabs are equally prominent.
- Dashboards (`AuditDashboard`, `ExecutiveDashboard`) are portfolio-first; "My Work" exists only in the Action Centre (`ia_q_my_audit_work` + 8 more governed queue RPCs).
- **No continue-audit/resume capability** anywhere.
- Time tracking is engagement-level (not activity-level); standalone page, no quick-log from fieldwork context.
- Workload/capacity: **three independent client-side derivations** (`WorkloadCapacity`, `TeamAvailabilityDashboard`, `CapacityCalendarPanel`) — no shared read model.
- Context inheritance: good for activity-scoped evidence/workpaper/finding inline forms; control-test creation auto-fills tester/date but is not scoped to the engagement's RCM tree.

### 4.8 RBAC
`ia_actor_can(module, action)` + companion `ia_can_*` functions + a parallel generic `has_permission`. **Module-key casing drift**: `'Internal Audit'` / `'InternalAudit'` / `'internal_audit'` are distinct keys across migrations. No capability keys exist for methodology (view/create/edit/approve/retire), programme tailoring, template-library management, QA review, or findings create/approve.

## 5. Preservation & impact-control matrix (section A)

| Concept | Current canonical implementation | Table / component / RPC | Treatment | Reason |
|---|---|---|---|---|
| Audit engagement | Live spine | `ia_audit_engagements`, `EngagementDetail.tsx` | **KEEP** | Accepted; do not redesign |
| Audit objectives | Free text on engagement | `ia_audit_engagements.objectives` | **EXTEND** | Add structured objective rows linked into RCM, keep text for narrative |
| Preparation checklist | Live, templated | `ia_preparation_checklists`, `ia_checklist_templates(+items)`, `AuditPreparationTab` | **KEEP** | Distinct from programme (AY) |
| Audit programme (template) | Orphaned table | `ia_audit_programs`, `ia_audit_procedures` | **EXTEND → revive as canonical Programme Template** | Already has version/approval columns; re-use rather than NEW |
| RCM process/risk/control | Live shared tree | `ia_rcm_processes/risks/controls`, `AuditProgrammeRcmTab` | **KEEP + EXTEND** | Add objective linkage and engagement snapshot binding |
| RCM test (template) | Dead schema | `ia_rcm_tests` | **EXTEND → activate** | Canonical programme test definition; wire into execution |
| Audit procedure | Orphaned child of programs | `ia_audit_procedures` | **EXTEND** | Becomes procedure under programme template; per H, procedure is primary, test steps underneath |
| Control test (executed) | Live, governed RPC | `ia_control_tests`, `ia_conclude_control_test` | **KEEP + EXTEND** | Add sample-item derivation, evidence links, exception linkage |
| Test step / question | None (only effectiveness enum) | — | **NEW (child of procedure/test definition)** | Governed response types per J; not naive Yes/No |
| Sample / sample item | Dead schema | `ia_control_test_results` | **EXTEND → activate as sample-item execution** | Per O: derive sample size / exception count from items |
| Evidence | Canonical, two divergent upload paths | `ia_evidence`, `auditAttachmentUpload.ts` | **KEEP + EXTEND** | Add polymorphic link table; write `hash`; unify on signed-URL path |
| Working paper | Rich schema, thin UI | `ia_working_papers`, `AuditWorkingPapersTab` | **KEEP + EXTEND** | Executed procedure may act as primary workpaper (AI); expose preparer/reviewer/conclusion only where standalone paper is genuine |
| Test result | Governed on control test | `ia_control_tests.result/conclusion` | **KEEP** | Distinct from control effectiveness per L |
| Exception / potential finding | Only integer count + rationale guardrail | `ia_control_tests.exceptions_found` | **NEW `ia_test_exceptions` (lightweight)** | Section S/T hard rule; no heavy lifecycle |
| Finding | Mature | `ia_findings` (+severity history) | **KEEP** | Add upstream traceability links only (V/W) |
| Recommendation | Mature | `ia_recommendations` | **KEEP** | Distinct from management action (Y) |
| Management response | Mature, versioned, dispute-aware | `ia_management_responses` | **KEEP** | Z preserved |
| Corrective action | Mature, IA verification separate | `ia_action_tracking` | **KEEP** | |
| Follow-up | Mature | `ia_follow_ups` | **KEEP** | |
| Quality review | Review-level lifecycle | `ia_quality_reviews(+checklist)` | **KEEP + EXTEND** | Add lightweight per-note Open→Response→Cleared where needed (AJ) |
| Report | Mature, sealed, immutable | `ia_audit_reports`, `ia_document_artifact` | **KEEP** | |
| Checklist templates | Live, no lifecycle | `ia_checklist_templates(+items)` | **EXTEND** | Add status/version to enter Template Library |
| Programme templates | Orphaned | `ia_audit_programs` | **EXTEND** (see above) | |
| Document/report templates | Governed pipeline | `ia_document_template_settings/sections`, `ia_document_section_library`, `ia_org_document_foundation` | **KEEP** | |
| Plan templates | Governed | `ia_audit_plan_templates(+profiles)` | **KEEP** | |
| Management response templates | Editor exists, persistence unverified | `ManagementResponseTemplateEditor` | **EXTEND/fix** | Verify backing store; wire into library |
| Communication templates | Omni-Comms canonical | `core_template*` via Omni-Comms | **KEEP (reference only)** | Library links, never duplicates (AP.8) |
| Legacy generic doc templates | Deprecated orphan page | `ia_document_templates`, `TemplatesManagement.tsx` | **LEGACY-READ-ONLY** | Retain history; remove from nav; keep route guard |
| Department audits | Dead-end parallel spine | `ia_department_audits`, `DepartmentAuditForm.tsx` | **LEGACY-READ-ONLY** | No destructive migration; stop new writes |

## 6. Duplicate / legacy structures found (BL)

1. `ia_department_audits` — parallel pre-engagement spine; writes never join execution/closure/reporting. → LEGACY-READ-ONLY.
2. `ia_audit_programs`/`ia_audit_procedures` — orphaned; → revived as canonical programme template (avoid NEW).
3. `ia_rcm_tests` — dead template-test table; → activated.
4. `ia_control_test_results` — dead sample-item table; → activated.
5. Two checklist engines (`ia_audit_checklists` vs `ia_preparation_checklists`) — both live for different phases; documented, not merged (AY distinction is intentional).
6. Two evidence upload paths (one broken for private bucket) — converge on canonical helper.
7. `ia_working_papers` vs `ia_control_tests` parallel "procedure execution" concepts — reconciled by AI rule (executed procedure = primary workpaper).
8. `ia_findings.recommendation` free-text duplicates `ia_recommendations`; triple status columns on `ia_action_tracking`; dual evidence arrays — documented, non-blocking.
9. `ia_document_templates` legacy store vs `ia_document_template_settings` modern store — legacy read-only.
10. No hardcoded question banks, no naive Yes=1 scoring, no mock production data, no Compliance cross-domain coupling found. ✅

## 7. Methodology semantic gaps (D–M)

| Gap | Severity | Affected object |
|---|---|---|
| Objective→Risk chain broken (objectives free text) | High | engagement/RCM |
| Criteria free-text only, not per risk/control, no governed criteria type list | Medium | engagement |
| `ia_rcm_tests` unused — no programme test definitions | High | programme |
| No engagement-bound programme snapshot; RCM master edits silently affect in-flight audits (AE/AF/AU) | **Critical** | versioning |
| Sample size / exceptions manually typed; `ia_control_test_results` dead (O) | High | sampling |
| Test→Evidence link is jsonb array with no UI (P) | High | evidence |
| No exception/potential-finding layer (S/T) | **Critical** | execution |
| No response-type model beyond effectiveness enum (J) | Medium | test steps |
| Design vs operating effectiveness not distinguished (M) | Low | control tests |
| Review-note per-item lifecycle absent (AJ) | Medium | QA |
| RBAC methodology/programme/template-library keys absent (BN) | High | security |

## 8. Question/test gaps (H, I)

No hardcoded question banks exist — content is DB-driven (good). Gap is structural: there is no test-step entity under procedures at all, so governed test-step wording quality (I), response types (J), and N/A rationale (AD) have nowhere to live yet. To be added as a governed child of programme/test definitions — never as frontend arrays.

## 9. RCM → executable test mapping (current vs target)

Current: RCM tree built ad hoc → control tests created manually from a flat all-controls dropdown → badge only.
Target: Approved Programme Template (objectives→risks→controls→procedures→test steps) → engagement selects template → **engagement-bound snapshot** created → execution derives samples, exceptions, evidence links → existing `ia_conclude_control_test` governance retained.

## 10–24. _Pending implementation phases._

---

## BX. Concept mapping table (baseline column state)

| Concept | Current implementation | Correct canonical source | Gap | Treatment | User impact |
|---|---|---|---|---|---|
| Methodology | none (narrative text) | programme template + governance | no governed methodology object | EXTEND `ia_audit_programs` | auditors get approved reusable programmes |
| Programme Template | orphaned `ia_audit_programs` | same, revived | not connected to execution | EXTEND | new audits start from approved template |
| Engagement Programme | ad-hoc RCM per engagement | engagement-bound snapshot of template | none exists | NEW snapshot binding | historical reproducibility |
| Objective | engagement free text | structured objective rows | no linkage | EXTEND | traceability chain head |
| Process | `ia_rcm_processes` | same | — | KEEP | — |
| Risk | `ia_rcm_risks` | same | no objective FK | EXTEND | — |
| Criteria | engagement free text | governed criteria reference + per-item link | no structure | EXTEND | 5 C's stay aligned |
| Control Objective | not modelled | attribute on control where relevant | absent | EXTEND (light) | — |
| Control | `ia_rcm_controls` | same | shared-master mutation risk | KEEP + snapshot | — |
| Procedure | `ia_audit_procedures` (orphan) | same, under template | not executed | EXTEND | procedure becomes primary workpaper |
| Test Step | none | child of procedure/test def | absent | NEW | execution aid, not primary object |
| Checklist Question | `ia_checklist_template_items` | same (preparation only) | — | KEEP | preparation stays distinct |
| Response | effectiveness enum only | governed response-type sets | absent | NEW (governed) | right answer format per test |
| Population | none | field group on test execution | absent | EXTEND | sample basis documented |
| Sample | `sample_size` integer | derived from sample items | manual entry | EXTEND | no double counting |
| Sample Item | `ia_control_test_results` (dead) | same, activated | no UI | EXTEND | item-level testing |
| Evidence | `ia_evidence` | same + polymorphic links | limited link targets | EXTEND | one file, many links |
| Test Result | `ia_control_tests.result` via RPC | same | — | KEEP | — |
| Exception | integer count | `ia_test_exceptions` (lightweight) | absent | NEW | judgement before finding |
| Finding | `ia_findings` | same | no risk/objective FK | KEEP + EXTEND | backward navigation |
| Recommendation | `ia_recommendations` | same | — | KEEP | — |
| Management Response | `ia_management_responses` | same | — | KEEP | — |
| Management Action | `ia_action_tracking` | same | — | KEEP | — |
| Working Paper | `ia_working_papers` | same | thin UI | EXTEND | no duplicate entry |
| Review Note | review-level only | per-note lifecycle on QA checklist | absent | EXTEND | practical review |
| Quality Review | `ia_quality_reviews` | same | — | KEEP | — |
| Engagement Conclusion | report/conclusion fields | same | — | KEEP | — |
| Report | `ia_audit_reports` + artifacts | same | — | KEEP | — |
| Follow-Up | `ia_follow_ups` | same | — | KEEP | — |
| Preparation Template | `ia_checklist_templates` | same | no lifecycle | EXTEND | library-visible |
| Programme Template | `ia_audit_programs` | same | orphaned | EXTEND | library-visible |
| Report Template | `ia_document_template_settings` | same | — | KEEP | library-visible |
| Plan Template | `ia_audit_plan_templates` | same | — | KEEP | library-visible |
| Mgmt Response Template | editor, persistence unverified | `ia_document_template_settings` key | verify/fix | EXTEND | library-visible |
| Communication Template | Omni-Comms `core_template*` | same | — | KEEP (reference) | linked, not duplicated |

## BY. Template inventory table

| Family | Canonical store | Editor | Governance | Library entry | Versioned? | Used-by? | Required change |
|---|---|---|---|---|---|---|---|
| Audit Programme/Methodology | `ia_audit_programs(+procedures)` | none live | `version`, `approved_by` columns dormant | **missing** | columns only | no | revive + editor + snapshot binding |
| Preparation Checklist | `ia_checklist_templates(+items)` | embedded in Preparation tab | none | **missing** | no | no | add status/version + library entry |
| Audit Plan | `ia_audit_plan_templates(+profiles)` | `AuditPlanTemplateEditor` | full draft→published→archived, clone, RBAC | partial | yes | profiles link | surface in library |
| Audit Report (document) | `ia_document_template_settings/sections` + section library + foundation | `AuditReportTemplateEditor` | foundation-enforced | partial | config-level | section-level | surface in library |
| Management Reporting | `ia_report_definition(+section/metric)` | Reporting Configuration | governed, audited | partial | yes | snapshots | surface in library (reference) |
| Management Response | unverified (likely defaults-only) | `ManagementResponseTemplateEditor` | none | **missing** | no | no | verify persistence, wire in |
| Working Paper | none (not genuinely needed per AI) | — | — | n/a | — | — | document decision |
| IA Communication | Omni-Comms `core_template*` (module=AUDIT) | Omni-Comms Core Designer | Omni-Comms governance | link only | yes | via Omni-Comms | library reference link |
| Section Library | `ia_document_section_library` | `SectionLibraryViewer` | foundation pipeline | partial | — | applies_to | surface in library |
| Document Foundation/branding | `ia_org_document_foundation` | `FoundationSettingsEditor` | single source | partial | — | all docs | surface in library |
| Distribution | `ia_distribution_templates` | embedded in distribution dialogs | none | **missing** | no | recipients table | add lifecycle + library entry |
| Mitigation | `ia_mitigation_templates` | embedded in Risk Register | none | **missing** | no | no | add lifecycle + library entry |
| Legacy generic docs | `ia_document_templates` | `TemplatesManagement.tsx` (deprecated, orphaned) | dead columns | **legacy** | dead | no | read-only, unroute from nav |

## BZ. UX burden table (current → target)

| Activity | Current clicks/screens | Duplicate entry | Current pain | Target interaction | Change required |
|---|---|---|---|---|---|
| Start audit | 3 | no | fine | unchanged | none |
| Load programme | 2 | **yes — RCM rebuilt ad hoc per audit** | no template reuse | select approved template → snapshot generated | programme snapshot |
| Execute procedure | 3 | partial | procedure/test/sample split across tabs | one procedure execution panel | stage-grouped workspace |
| Create sample | 3–4 | **yes — size typed manually** | no item-level capture | add items; size derived | sample-item UI |
| Attach evidence | 3 | no (good inheritance) | test-level attach missing; direct-open broken | attach from test/procedure context | unify upload path |
| Record exception | 4 | **yes — count typed** | no exception object | exception record with disposition | exception layer |
| Create finding | 3 | **yes — context re-selected** | manual control_test link | Create Finding from Exception, pre-carried context | one-click conversion |
| Review work | 2 | no | review-level only | per-note Open→Response→Cleared where needed | light extension |
| Continue previous work | **not possible** | — | full re-navigation | Continue card on My Work | new read model |
| Close audit | 3 | no | governed, fine | unchanged | none |

_Phases 2–8 (implementation, tests, E2E, verdict) pending. No changes made during rebaseline._

---

## 10. Phase 2–3 Implementation Evidence (TEST, authenticated)

All proofs below were executed against the TEST project through the REST API using a genuine
authenticated Internal Audit session (no SQL bypass, no service role).

### 10.1 Programme snapshot foundation — PROVEN

| # | Check | Result |
|---|-------|--------|
| P1 | Master programme frozen once Approved | `IA_PROGRAMME_FROZEN` on `program_name` update |
| P2 | Procedures of an approved master frozen | `IA_PROGRAMME_FROZEN: parent programme is Approved` |
| P3 | Bind master → engagement snapshot | `{"success": true, "steps": 2, "engagement_programme_id": "a297ce54-…"}` |
| P4 | Approve snapshot materialises control tests | `{"success": true, "steps": 2, "control_tests_created": 1}` (1 of 2 steps carries an RCM control) |
| P5 | Approved snapshot planning fields frozen | `IA_PROGRAMME_SNAPSHOT_FROZEN: field "title" is frozen…` |
| P6 | Execution fields still mutable after approval | `execution_status` → `In Progress` accepted |

No methodology-version history was invented for pre-existing audits; the single legacy engagement
keeps its original control test untouched.

### 10.2 Sample-item execution — PROVEN

Sample items recorded on `ia_control_test_results` derive the parent test metrics:
`{"sample_size": 3, "exceptions_found": 1}` — no manual entry of either number.

### 10.3 Exception / potential-finding model — PROVEN

| # | Check | Result |
|---|-------|--------|
| E1 | Conclude with an unevaluated exception | blocked — `IA_EXCEPTIONS_UNEVALUATED` |
| E2 | Evaluate "No Finding" without rationale | blocked — `IA_RATIONALE_REQUIRED` |
| E3 | Evaluate "Finding Raised" without a finding | blocked — `IA_FINDING_REQUIRED` |
| E4 | Evaluate with documented rationale | accepted |
| E5 | Conclude after evaluation | accepted, `exceptions: 1, linked_findings: 0` |

No failed test, failed sample, partial or ineffective result creates a finding automatically at any
point in the chain. Findings remain an explicit auditor act on the Findings tab.

### 10.4 UI surfaces added (additive, no mature capability removed)

- `EngagementProgrammePanel` — bind / tailor / approve the engagement programme, shown at the top of
  the existing **Programme / RCM** tab. Approved snapshots show a lock and per-step execution state.
- `TestExecutionPanel` — sample-item capture, exception raising and exception evaluation, opened from
  a new action on each row of the existing **Control Tests** tab.
- Findings, responses, actions, follow-up, quality review, reporting, sealing, Management Reporting
  and Omni-Comms were not modified.

### 10.5 Status

Phases 0–3 of this gate are complete and proven. **Not yet complete:** evidence upload convergence
onto the canonical signed-URL/attachment path with hash population, the Template Library front door,
the stage-grouped workspace / Continue Audit UX, and the full deterministic + usability + scalability
test suite. The gate verdict therefore remains **IN PROGRESS — no PASS issued.**
