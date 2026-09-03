# Why BN-20260902-76270 shows "Evidence Complete" with zero evidence

Read-only diagnosis of claim `e7c0d598-cb03-4f0e-98e1-0925fadcc564` (SKN-INV v2, product version `02d8f5b9…`, claim status CLOSED). Nothing was modified.

## Root cause — vacuous success on an unconfigured product version

Three facts, each verified directly:

1. **SKN-INV v2 has no document requirements at all.** `bn_doc_requirement` returns **0 rows** for product `a4f9e312…` and for both of its versions (v1 `482ca27c…` and v2 `02d8f5b9…`). Platform-wide there are 456 active requirements across 57 product versions — SKN-INV is simply not one of them.
2. **The claim therefore has no checklist.** `bn_evidence_checklist` = 0 rows, `bn_claim_evidence` = 0, `bn_claim_document` = 0. `generateEvidenceChecklist()` (`evidenceService.ts:345-347`) returns early when the requirement set is empty, so no rows were ever created — which is also why there are no audit actions.
3. **The badge treats "nothing to check" as "everything verified."** `isEvidenceComplete()` (`evidenceService.ts:327-343`) selects the checklist rows, filters for blocking-and-unsatisfied, and returns `incomplete.length === 0`. On an empty array that is `true`. `EvidenceChecklist.tsx:125-137` renders that boolean directly as the green **Evidence Complete** badge and the caption "All mandatory documents have been verified", with `blockingCount = 0`.

**Exact root cause:** zero configured requirements → empty checklist → `incomplete.length === 0` → `true`. The badge is asserting a verification that never happened.

**Classification: both.** The trigger is a **configuration gap** (SKN-INV v2 was activated with no document requirements). The reason it presents as a green assurance rather than a warning is a **code defect** — `isEvidenceComplete` cannot distinguish "all requirements satisfied" from "no requirements exist", and the UI has no third state for it.

## SIP-DOC-01 — is it part of eligibility for this version?

Yes, it is configured on v2, and it is correctly configured:

```text
rule_code "[ SIP-DOC-01]"   rule_kind DOCUMENT_STATUS   severity BLOCK   fail_action REJECT
fact_key  document.medical_certificate.status          is_active true
```

But the eligibility record actually persisted for this claim (`bn_claim_eligibility` `2e44a221…`, 12:19:32) recorded it as:

```text
"passed": true, "field_key": null, "fail_action": "INFO",
"message": "Legacy rule — no field_key; treated as INFO."
```

All five SIP rules were recorded that way, and the claim came out `overall_result = true`. That message string **does not exist anywhere in the current source** — it is the pre-BUG-29 behaviour described in the header comment of `eligibility/eligibilityEvaluator.ts:9-13`, which read only `rule_definition.field_key` and waved through any rule that used the `fact_key` column instead. The current evaluator fails closed (records UNEVALUATED and blocks).

So the eligibility record was written by a **build that predates the current evaluator** — the same stale-bundle signature as the 12:19:45 `FORMULA_NONE` calculation on this claim, 13 seconds later. That reinforces, independently, the earlier finding that the runtime serving this claim is not the current code.

Worth noting: the rule codes are stored with **leading spaces** (`" SIP-DOC-01"`, `" SIP-AGE-01"`). That is a separate data-hygiene defect that will break any code-based lookup, override or reporting join.

For completeness, the document fact resolver itself is *not* vacuous: `productMandatoryEvidenceComplete` (`eligibilityFactResolver.ts:193`) returns `false` when the mandatory set is empty, so `document.medical_certificate.status` would resolve to `PENDING`, not `VERIFIED`, under the current evaluator. Only the checklist badge is vacuous.

## Safest UI-only next step

The claim is CLOSED, so nothing on it should be re-driven. The safe, UI-only action is configuration, not claim work:

1. Open **Product Catalog → SKN-INV → Version 2 → Document Requirements** and confirm it is empty there too (it will be).
2. Add the mandatory requirements the product actually needs — at minimum the medical certificate the two BLOCK rules `SIP-DOC-01` and `SIP-MEDBOARD-01` depend on — with `requirement_level = MANDATORY` and `blocks_decision = true`. Until that exists, every SKN-INV claim will show a green Evidence Complete badge on an empty folder.
3. Register a **fresh** SKN-INV claim after a hard browser reload and confirm the Documents tab now shows "N mandatory document(s) still outstanding" instead of the green badge.

Do not attempt to correct this claim from the UI; it is closed and its records are the evidence for both this finding and the calculation finding.

## Defects to raise

- **BN-EVID-VACUOUS-COMPLETE** (code) — `isEvidenceComplete` must return a third state (`NOT_CONFIGURED`) when the claim has no checklist rows, and `EvidenceChecklist` must render that as a neutral or warning state, never as "All mandatory documents have been verified".
- **BN-CFG-SKNINV-NO-DOCREQ** (configuration) — SKN-INV v1 and v2 are ACTIVE with zero document requirements while two BLOCK-severity document rules reference a medical certificate.
- **BN-CFG-RULECODE-WHITESPACE** (data) — leading spaces in `bn_eligibility_rule.rule_code` for `" SIP-DOC-01"` and `" SIP-AGE-01"`.
- Related, already open from the previous diagnosis: the runtime serving this claim predates both the current eligibility evaluator and the formula-binding path.
