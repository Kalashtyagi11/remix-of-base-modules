# Internal Audit — Multi-Tab / Multi-Step Validation UX Convergence

Wave: IA-UX-VAL (presentation layer only)
Date: 2026-09-03
Baseline HEAD at rebaseline: `269db7ad2`
Scope: Internal Audit plan / engagement / configuration data-entry surfaces
Stage 2E: already certified — not modified in this wave.

---

## 1. Defect reproduced — IA-UX-VAL-001

Surface: `src/components/audit/EditEngagementDialog.tsx` (used for both **Add Audit to Plan** and **Edit Audit**).

Before: a single flat validator returned `string[]` and the submit handler surfaced only
`errors[0]` in a toast. Required fields live on four different tabs, so a user standing on
*Schedule & Resources* was told "Audit title is required" with no way to see which section
owned the failure, no per-tab indication, and no inline field error.

Root cause: validation was record-level while the UI is section-level; the two were never
mapped to one another.

---

## 2. Census of Internal Audit multi-tab / multi-step data-entry surfaces

Classification used:
- **A** — multi-tab, single whole-record submit (cross-tab misdirection risk)
- **B** — multi-tab, independent per-tab saves (no cross-tab validator)
- **C** — multi-tab, read/analytics only (no data entry)
- **D** — nested dialog owns its own scoped validation

| Surface | Tabs | Class | Cross-tab validator | Action |
| --- | --- | --- | --- | --- |
| `components/audit/EditEngagementDialog.tsx` | 4 | **A** | Yes — whole record | **Remediated (this wave)** |
| `components/audit/AddEngagementToPlanForm.tsx` | 0 | — | n/a (single-column form) | No change |
| `pages/audit/AuditPlanDetail.tsx` | 10 | B | No | No change |
| `pages/audit/EngagementDetail.tsx` | 14 | B | No | No change |
| `pages/audit/AuditPreparation.tsx` | 3 | B | No | No change |
| `pages/audit/AuditPlansNew.tsx` | 2 | B | No | No change |
| `pages/audit/PlanApproval.tsx` | 3 | B | No | No change |
| `pages/audit/AuditConfig.tsx` | 6 | B | No | No change |
| `pages/audit/RiskSettings.tsx` | 5 | D | Band overlap check is scoped to the Bands tab dialog | No change |
| `pages/audit/RiskRegister.tsx` | 2 | B | No | No change |
| `pages/audit/EscalationRoles.tsx` | 3 | B | No | No change |
| `pages/audit/WorkloadCapacity.tsx` | 3 | C | No | No change |
| `pages/audit/AuditAccessMatrix.tsx` | 2 | C | No | No change |
| `pages/audit/DocumentTemplateSettings.tsx` | 5 | B | No | No change |
| `pages/audit/AuditReferenceMasters.tsx` | 1 | D | Governed RPC validation | No change |
| `components/audit/templates/AuditPlanTemplateEditor.tsx` | 5 | B | No | No change |
| `components/audit/PlanDistributionTab.tsx` | 3 | B | No | No change |
| `components/audit/AutoPlanSuggestions.tsx` | 3 | D | Scoped dialog | No change |
| `components/audit/CandidateDetailPanel.tsx` | 4 | C | No | No change |
| `components/audit/CapacityCalendarPanel.tsx` | 3 | C | No | No change |
| `components/audit/plan/PlanPortfolioPanel.tsx` | 4 | C | No | No change |
| `components/audit/reports/AuditReportCenter.tsx` | 3 | C | No | No change |
| `components/audit/execution/AuditActivitiesTab.tsx` | n/a | B | No | No change |

Hidden-tab native-constraint scan: no `required` attribute on any `Input` / `Select` /
`Textarea` inside an Internal Audit tab panel, so no browser-native "not focusable" submit
failures exist on these surfaces.

Conclusion: **EditEngagementDialog is the only Class A surface** in Internal Audit. All other
tabbed surfaces either save per tab, are read-only, or validate inside a self-contained dialog.

---

## 3. Reusable tab-aware validation contract

New module: `src/lib/audit/tabValidation.ts` (presentation-only, no server authority).

Provides:
- `IaValidationIssue` — `{ field, tabId, message, severity?, blockingAction?, restricted? }`
- `IaTabDescriptor`, `IaFieldTabMap`, `tabForField()` — declarative field → tab ownership
- `issuesForTab()` — local (per-tab) save semantics
- `errorCountsByTab()` — tab error badges, warnings excluded
- `fieldErrorMap()` — inline field-level errors
- `getFirstInvalidTab()` — deterministic routing in declared tab order, skipping tabs the
  persona may not act on (`restricted: true`)
- `restrictedIssues()` — issues to explain rather than deep-link
- `fieldAnchorId()` / `focusFirstInvalidField()` — scroll + focus to the first invalid control
- `summariseIssues()` — action-level summary text
- `mapServerErrorToIssue()` — routes governed server errors (e.g. `IA_FISCAL_*`,
  `IA_INVALID_DEPARTMENT`, `IA_USE_GOVERNED_COMMAND`) back to the owning tab **without
  rewriting or hiding the server message**.

Server remains authoritative. This contract only decides *where the user is taken* and *how
the message is displayed*; it never suppresses, weakens, or pre-empts a governed check.

---

## 4. Remediation applied — EditEngagementDialog

- Four tab descriptors and an explicit `FIELD_TAB_MAP` covering every validated field.
- `validate(): string[]` replaced by `buildIssues(): IaValidationIssue[]`; **all pre-existing
  business rules are unchanged** (title, department, function, inclusion rationale + conditional
  notes, expected deliverables + conditional notes, lead auditor, estimated days, date ordering).
- Whole-record submit (Save / Add Engagement) keeps validating the whole record — correct for
  a Class A single-transaction surface — but now:
  - stays on the current tab when it holds errors, otherwise jumps to the first invalid tab in
    tab order,
  - focuses and scrolls to the first invalid control,
  - shows a summary toast instead of a single decontextualised message.
- Controlled `Tabs` with a per-tab error-count badge (`aria-label="N issues in <tab>"`).
- Form-level summary panel (`role="alert"`) where each item deep-links to its owning tab.
- Inline per-field errors via `FieldSlot` (`role="alert"`, anchored `id="ia-field-<field>"`).
- Errors clear as soon as the user edits the offending field.
- Engagement status remains read-only in the dialog (Stage 2E governed vocabulary preserved).

---

## 5. Runtime evidence (authenticated UI, no service-role shortcut)

Persona: System Admin. Route: `/audit/audit-plans/3a11e7aa-6227-4b6e-a960-0005f1f1346b`
(Annual Internal Audit Plan 2030, Draft) → **Add Audit**.

| Scenario | Observed |
| --- | --- |
| Submit an empty record from *Schedule & Resources* | Stays on *Schedule & Resources* (it holds an error), focuses the invalid `Estimated Days` input |
| Tab badges | `4 issues in Identity & Coverage`, `1 issue in Planning Narrative`, `1 issue in Team & Ownership`, `1 issue in Schedule & Resources` |
| Summary | "7 items need attention across 4 sections." with all seven items listed and deep-linked |
| Inline error | "Estimated days is required" rendered under the field as `role="alert"` |
| Deep link click ("Planning Narrative: …") | Active tab switches to *Planning Narrative* |
| Fix Audit Title | Identity badge drops 4 → 3 immediately; other badges unchanged |
| Console errors | none |

Screenshots: `/tmp/browser/iaval/after_submit.png`, `/tmp/browser/iaval/after_fix.png`.

---

## 6. Tests

`src/__tests__/auditTabValidation.test.ts` — 14 tests, all passing:
tab-order routing (not error order), deterministic advance after a fix, restricted-tab skipping,
empty-issue null, badge counts, warning exclusion, per-tab scoping, field error map, summary
pluralisation, anchor id stability, field→tab fallback, governed server-error routing, unmapped
server-message preservation, null server error.

`src/__tests__/auditWorkflowVocabulary.test.ts` — 9 tests, still passing (Stage 2E parity intact).

TypeScript: `tsgo --noEmit` clean. Build: `build OK`.

---

## 7. Regression posture

- Stage 2A (Fiscal Calendar): PASS — unchanged, no fiscal code touched.
- Stage 2B (Reference Masters): PASS — unchanged, selectors untouched.
- Stage 2C (Authoritative Numbering): PASS — unchanged, engagement codes remain server-allocated;
  no client code generation reintroduced.
- Stage 2D (Department / Function Referential Integrity): PASS — unchanged; department/function
  guards untouched, dialog still surfaces the governed errors verbatim.
- Stage 2E (Workflow Vocabulary): PASS — unchanged; engagement status remains read-only here.
- FY2032 plan: CLOSED · 20/20 — untouched (no database change in this wave).
- No migration, RPC, RLS, grant or server function was created or altered in this wave.
- Pre-existing unrelated failures (OBS-E2E-D communication-hub drift) remain out of scope.

---

## 8. Final status

```
IA MULTI-TAB / MULTI-STEP VALIDATION UX CONVERGENCE: PASS
IA-UX-VAL-001: CLOSED
CENSUS: COMPLETE — 23 surfaces classified, 1 Class A surface remediated
SHARED CONTRACT: src/lib/audit/tabValidation.ts
SERVER AUTHORITY: PRESERVED
STAGE 2A: PASS (unchanged)
STAGE 2B: PASS (unchanged)
STAGE 2C: PASS (unchanged)
STAGE 2D: PASS (unchanged)
STAGE 2E: PASS (unchanged)
FY2032 PLAN: CLOSED · 20/20
STAGE 2F: NOT STARTED
```
