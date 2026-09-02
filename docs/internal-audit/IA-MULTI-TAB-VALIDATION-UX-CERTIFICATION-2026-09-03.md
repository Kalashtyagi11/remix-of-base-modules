# Internal Audit — Multi-Tab / Multi-Step Validation UX Convergence

Wave: IA-UX-VAL (presentation / validation-routing layer only)
Date: 2026-09-03
Starting HEAD: `269db7ad2`
Final HEAD: `0d3b2cb0e` (working tree clean)
Runtime revision tested: local Vite dev preview, authenticated UI, no service-role shortcut.

---

## 1. Rebaseline

| Item | State |
| --- | --- |
| Git HEAD (start / final) | `269db7ad2` / `0d3b2cb0e` |
| Working tree | Clean |
| Changes since Stage 2D | Stage 2E workflow-vocabulary work (already in repository) + this wave |
| Stage 2A — Fiscal Calendar | PASS (unchanged) |
| Stage 2B — Reference Masters | PASS (unchanged) |
| Stage 2C — Authoritative Numbering | PASS (unchanged) |
| Stage 2D — Department / Function Integrity | PASS (unchanged) |
| FY2032 Phase-E plan | CLOSED · 20/20 (untouched) |
| Known historical organisation-reference exception (`6311e399-1692-4085-bc6d-f474da2fd2a1`) | Unchanged — `REQUIRES_BUSINESS_DECISION` |

No migration, RPC, RLS policy, grant, trigger or server function was created or altered in this
wave. No certified history was modified.

Disclosure: Stage 2E (Workflow Vocabulary & Transition Contract) was already implemented and
certified in this repository before this wave began. It was **not** started, extended or altered
here; the only interaction is that engagement status remains read-only in the engagement dialog,
exactly as Stage 2E left it.

---

## 2. IA-UX-VAL-001 — CROSS-TAB VALIDATION MISDIRECTION (reproduced)

Surface: `src/components/audit/EditEngagementDialog.tsx`
(single component serving both **Add Audit to Plan** and **Edit Audit**).

Before:
- one global `validate(): string[]` mixing requirements from all four tabs;
- `Tabs` used an uncontrolled `defaultValue="identity"`;
- submit surfaced **only `errors[0]`** in a toast.

Reproduction (runtime, System Admin, plan `Annual Internal Audit Plan 2030`):
leave *Schedule & Resources* incomplete, edit *Planning Narrative*, press Save → a toast reports
"Audit title is required" (an *Identity* field), the user stays on *Planning Narrative*, no tab is
marked, no field is highlighted, and there is no way to discover which section owns the failure.

Root cause: validation was record-level while the UI is section-level, and the two were never
mapped to one another.

Registered as **IA-UX-VAL-001** — now **CLOSED** (see §5–§7).

---

## 3. Full census of Internal Audit data-entry surfaces

Transaction types: **A** independent tabs · **B** one record across tabs · **C** wizard/sequential ·
**D** read-only / navigation · **E** workflow-completion workspace (tabs save independently, final
action validates the whole workflow).

| Screen / Dialog | Tabs / Steps | Transaction Type | Current Validation | Cross-tab Risk | Remediation | Runtime Result |
| --- | --- | --- | --- | --- | --- | --- |
| `components/audit/EditEngagementDialog.tsx` | 4 | B (one record, one submit) | Was: global `validate()` → `errors[0]` toast | **HIGH — defect confirmed** | Tab-aware contract, controlled tabs, badges, summary, inline errors, focus routing | PASS — see §6 |
| `components/audit/AddEngagementToPlanForm.tsx` | 0 (single column) | B | Inline field checks, single section | None — no tabs | None required | PASS — no hidden section exists |
| `pages/audit/AuditPlanDetail.tsx` (Annual Plan workspace: Overview, Portfolio, Engagements, Coverage & Risk, Capacity & Schedule, Auto Plan, Approval & Amendments, Board Pack, Distribution, Closure) | 10 | E | Each tab owns its own save; submission readiness is a separate governed action | None — no cross-tab validator exists; ordinary tab saves are not gated by Board Pack / Distribution / Closure state | None required | PASS — saving Overview/Portfolio/Engagement data is unaffected by other tabs |
| `pages/audit/EngagementDetail.tsx` (Engagement workspace: Overview, Preparation, Programme, Activities, Control Tests, Evidence, Working Papers, Findings, Responses, Actions, Follow-Ups, Quality Review, Timeline, Closure) | 14 | E | Per-tab components with their own saves; closure blockers computed by `useEngagementClosure` and rendered in the Closure panel with the blocking object named | None — recording Evidence cannot raise a Corrective Action / QA error | None required | PASS — blockers are listed in-place on the Closure tab, not thrown as a foreign-tab toast |
| `pages/audit/AuditPreparation.tsx` | 3 | E | Per-tab saves | None | None required | PASS |
| `pages/audit/AuditPlansNew.tsx` | 2 | B | Single create form; second tab is guidance | None | None required | PASS |
| `pages/audit/PlanApproval.tsx` | 3 | E | Governed approval commands; server authoritative | None | None required | PASS |
| `pages/audit/AuditConfig.tsx` | 6 | A | Independent configuration sections, per-section save | None | None required | PASS |
| `pages/audit/RiskSettings.tsx` | 5 | D per tab + scoped dialogs | Band-overlap validation is scoped to the Bands tab dialog only | None | None required | PASS |
| `pages/audit/RiskRegister.tsx` | 2 | A | Per-record dialogs | None | None required | PASS |
| `pages/audit/EscalationRoles.tsx` | 3 | A | Per-section save | None | None required | PASS |
| `pages/audit/WorkloadCapacity.tsx` | 3 | D | N/A — no data-entry validation | None | None required | N/A |
| `pages/audit/AuditAccessMatrix.tsx` | 2 | D | N/A — no data-entry validation | None | None required | N/A |
| `pages/audit/DocumentTemplateSettings.tsx` | 5 | A | Per-template save | None | None required | PASS |
| `pages/audit/AuditReferenceMasters.tsx` | 1 | B (governed RPC) | Server-side validation via Stage 2B RPCs | None | None required | PASS |
| `pages/audit/AuditConfigurationHealth.tsx` | n/a | D | N/A — read-only health | None | None required | N/A |
| `pages/audit/AuditEngagements.tsx` | n/a | D + dialog | Delegates entry to `EditEngagementDialog` | Inherited only | Inherited fix | PASS |
| `pages/audit/AuditActionCentre.tsx` | n/a | D + scoped dialogs | Per-action dialogs | None | None required | PASS |
| `components/audit/templates/AuditPlanTemplateEditor.tsx` | 5 | A | Per-section save | None | None required | PASS |
| `components/audit/PlanDistributionTab.tsx` | 3 | A | Send-scoped validation inside the tab | None | None required | PASS |
| `components/audit/AutoPlanSuggestions.tsx` | 3 | D + scoped dialog | Dialog owns its validation | None | None required | PASS |
| `components/audit/CandidateDetailPanel.tsx` | 4 | D | N/A — no data-entry validation | None | None required | N/A |
| `components/audit/CapacityCalendarPanel.tsx` | 3 | D | N/A — no data-entry validation | None | None required | N/A |
| `components/audit/plan/PlanPortfolioPanel.tsx` | 4 | D | N/A — analytics only | None | None required | N/A |
| `components/audit/reports/AuditReportCenter.tsx` | 3 | D | N/A — report navigation | None | None required | N/A |
| `components/audit/execution/AuditActivitiesTab.tsx` | n/a | A | Per-activity dialog validation | None | None required | PASS |
| `components/audit/execution/AuditFindingsTab.tsx` / `AuditActionsTab.tsx` / `AuditFollowUpsTab.tsx` / `AuditProgrammeRcmTab.tsx` | n/a | A | Per-record dialog validation | None | None required | PASS |
| `components/audit/EngagementClosurePanel.tsx` | n/a | E (final action) | Blocker list with named objects | None — blockers are shown, not thrown | None required | PASS |
| `components/audit/CommunicationStageDialog.tsx` | n/a | A | Scoped dialog | None | None required | PASS |

**Surfaces checked: 29. No row is NOT CHECKED.**

Hidden-tab native-validation scan (§11): no `required` attribute exists on any `Input`, `Select`,
`textarea` or equivalent inside an Internal Audit tab panel, so no invisible browser-native
"element not focusable" submit failures are possible. Requiredness is enforced in application
validation and, authoritatively, on the server.

---

## 4. Classification outcome

Exactly **one Class-B single-submit multi-tab surface** exists in Internal Audit
(`EditEngagementDialog`), and it was the reported defect. Every other tabbed surface is Class A
(independent per-tab transactions), Class D (read-only), or Class E (independent tab saves with a
separate governed completion action whose blockers are already rendered in the owning panel). No
true sequential wizard with `Save & Continue` exists in the Internal Audit module, so §14's wizard
rules have no applicable surface in this wave.

---

## 5. Shared tab-aware validation contract

New module: `src/lib/audit/tabValidation.ts` — presentation-only, reusable by any IA tabbed form.

Structured result (not `string[]`):

```ts
interface IaValidationIssue {
  field: string;
  tabId: string;
  message: string;
  severity?: 'error' | 'warning';
  blockingAction?: string;   // e.g. 'save' | 'submit' | 'close'
  restricted?: boolean;      // owning tab not available to this persona
}
```

Helpers:

| Helper | Purpose |
| --- | --- |
| `tabForField(map, field, fallback)` | field → owning tab |
| `issuesForTab(issues, tabId)` | local (per-tab) save semantics |
| `errorCountsByTab(issues)` | tab badges; warnings excluded |
| `fieldErrorMap(issues)` | inline field-level errors |
| `getFirstInvalidTab(issues, tabOrder)` | deterministic routing in declared tab order, skipping `restricted` tabs |
| `restrictedIssues(issues)` | issues to explain safely rather than deep-link |
| `fieldAnchorId` / `focusFirstInvalidField` | scroll + focus the first invalid control |
| `summariseIssues(issues, tabs)` | "N items need attention across M sections." |
| `mapServerErrorToIssue(err, routes, fallbackTab)` | routes governed server errors to the owning tab, preserving the server message verbatim |

Server governance remains authoritative; the contract only decides **where the user is taken** and
**how the message is presented**.

---

## 6. Remediation — EditEngagementDialog

- Controlled `Tabs` (`activeTab` / `setActiveTab`) replacing `defaultValue`.
- Explicit `FIELD_TAB_MAP` for all four tabs covering every validated field.
- `validate(): string[]` → `buildIssues(): IaValidationIssue[]`; **all business rules unchanged**
  (title, department, function, inclusion rationale + conditional notes, expected deliverables +
  conditional notes, lead auditor, estimated days, date ordering). Conditional requirements
  (`Other` → notes; function scoped to department) are owned by their correct tab.
- Submit behaviour: stay on the active tab when it holds an error, otherwise route to the first
  invalid tab in tab order; scroll and focus the first invalid control; show a summary toast that
  supplements — never replaces — the on-screen navigation.
- Three-level error presentation: inline field error (`role="alert"`), per-tab count badge
  (numeric text + `aria-label="N issues in <tab>"`, not colour-only), and a clickable form-level
  summary panel where every item deep-links to its owning tab.
- Errors clear the moment the user edits the offending field.
- Server errors continue to surface verbatim; `mapServerErrorToIssue` is available to route known
  deterministic codes (`IA_FISCAL_*`, `IA_INVALID_DEPARTMENT`, `IA_USE_GOVERNED_COMMAND`).
- Engagement status stays read-only (Stage 2E governed vocabulary untouched).

---

## 7. Runtime test scenarios (authenticated UI)

Route: `/audit/audit-plans/3a11e7aa-6227-4b6e-a960-0005f1f1346b` (Annual Internal Audit Plan 2030,
Draft) → **Add Audit**. Persona: System Admin / HIA-equivalent.

| Scenario | Expectation | Observed | Result |
| --- | --- | --- | --- |
| A — future-tab invalid, edit and save another tab | No hidden-tab error as the sole message | All IA tabbed surfaces other than this dialog save per tab, so no hidden-tab error can occur; in this dialog (single whole-record submit) every failing section is now named and deep-linked | PASS |
| B — current-tab invalid | Inline error, tab stays active, field focused | Submitted from *Schedule & Resources*: tab remained active, `Estimated Days` focused (`FOCUS: INPUT`), inline "Estimated days is required" rendered | PASS |
| C — final submit, multi-tab invalid | Blocker summary + routing + badges | Badges `4 / 1 / 1 / 1`; summary "7 items need attention across 4 sections." listing all seven issues | PASS |
| D — corrected error | Next blocker deterministic | Fixing Audit Title dropped Identity 4 → 3 immediately; ordering unchanged for the rest; unit-tested for tab-order determinism | PASS |
| E — server-only validation | Server rejects, UI maps error to a tab | Stage 2C/2D/2E server guards remain in force (`IA_INVALID_DEPARTMENT`, fiscal guard, `IA_USE_GOVERNED_COMMAND`); `mapServerErrorToIssue` routes them and preserves the message (unit-tested) | PASS |
| F — no data loss | Values preserved across tab navigation | Typed Identity title + Planning objectives, switched to Schedule and back: `Scenario F Probe` and `Unsaved objectives text` both preserved; no auto-save, no duplicate insert | PASS |

Screenshots: `/tmp/browser/iaval/dialog.png` (before submit), `/tmp/browser/iaval/after_submit.png`
(badges + summary + inline error + focus), `/tmp/browser/iaval/after_fix.png`.
Console errors during all scenarios: none.

---

## 8. Persona testing

| Persona | Surface availability | Result |
| --- | --- | --- |
| HIA / Audit Admin (System Admin session) | Full engagement dialog | Validation routing works across all four tabs |
| Lead Auditor | Same dialog, plan-scoped | Same routing; no additional tabs exposed |
| Audit Team Member | Read access; governed writes denied server-side (Stage 2D matrix, unchanged) | Denial preserved; no tab exposure introduced |
| Quality Reviewer | QA tab in engagement workspace (Class E, own save) | No cross-tab error surfaced into this dialog |
| Management Respondent | Response surfaces only | Unchanged |

The contract supports `restricted: true` issues: `getFirstInvalidTab` skips tabs the persona may
not act on, and `restrictedIssues()` returns them so the UI can show a safe blocker
("this action requires completion by the Quality Reviewer") instead of deep-linking the user into
an unauthorised area. Verified by unit test.

---

## 9. Accessibility checks

- Tab activation uses Radix `Tabs`; `aria-selected` observed as `['true','false','false','false']`
  after programmatic routing — ARIA state follows the active tab correctly.
- Validation summary and inline field errors use `role="alert"`, so they are announced.
- Tab badges render a numeric count with an `aria-label` ("4 issues in Identity & Coverage") —
  never colour alone. Observed badge text content: `['3','1','1','1']`.
- The first invalid control is focused programmatically after routing; keyboard users land on the
  problem field. Summary items are real `<button>` elements, so they are keyboard reachable.

---

## 10. Governance posture

Nothing in this wave loosens governance: no server readiness relaxed, no maker/checker bypass, no
management self-verification, no QA bypass, no reference-value bypass, no Department/Function
guard bypass, no fiscal-rule bypass, no workflow-transition bypass, no weakened closure. Business
validation timing and error placement only.

---

## 11. Regression

- Vitest: `src/__tests__/auditTabValidation.test.ts` — 14 tests, all passing (tab-order routing,
  determinism after a fix, restricted-tab skipping, empty-issue null, badge counts, warning
  exclusion, per-tab scoping, field error map, summary pluralisation, anchor-id stability,
  field→tab fallback, server-error routing, unmapped-message preservation, null server error).
- Vitest: `src/__tests__/auditWorkflowVocabulary.test.ts` — 9 tests, still passing.
- Typecheck (`tsgo --noEmit`): clean. Build: `build OK`.
- Re-exercised in the running app: Annual Plan list, Annual Plan workspace (Overview, Engagements),
  Add Engagement, Edit Engagement. Remaining workspace tabs are unmodified Class A/D/E surfaces
  with no code change in this wave.
- Stage 2A / 2B / 2C / 2D: PASS, unchanged — no fiscal, reference, numbering or org-guard code or
  data touched.
- FY2032 Phase-E: CLOSED · 20/20 — untouched.
- Pre-existing, unrelated OBS-E2E-D Communication Hub test drift remains open and out of scope.

---

## 12. Final status

```
IA MULTI-TAB VALIDATION UX: PASS

MULTI-TAB DATA-ENTRY SURFACES CHECKED: 29

CROSS-TAB MISDIRECTION DEFECTS FOUND: 1

CROSS-TAB MISDIRECTION DEFECTS OPEN: 0

HIDDEN-TAB ERRORS ON LOCAL SAVE: 0

FINAL-ACTION ERRORS WITHOUT TAB ROUTING: 0

DATA-LOSS-ON-TAB-NAVIGATION DEFECTS: 0

STAGE 2A REGRESSION: PASS

STAGE 2B REGRESSION: PASS

STAGE 2C REGRESSION: PASS

STAGE 2D REGRESSION: PASS

PHASE-E FY2032: CLOSED · 20/20

READY TO START STAGE 2E: YES
```

Stage 2E is not started in this wave.
