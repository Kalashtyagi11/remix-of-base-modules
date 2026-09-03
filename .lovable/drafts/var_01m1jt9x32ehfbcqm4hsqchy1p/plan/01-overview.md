# Benefits Defect Register — verification and fix plan

I checked each defect against the current code and live data before planning. Two of the five are already fixed in the working tree; three are real and confirmed.

## Verified status

| ID | Filed as | Verified status |
|----|----------|-----------------|
| ELIG-01 | Catalogue import writes an unreadable `rule_definition` | **Partly valid.** The three dialogs still write `fact_key` + `{parameter, operator, value_from, value_to, values}` and never write `field_key`. But the engine no longer needs `field_key`: it resolves the key from `fact_key`/aliases and understands the catalogue's `value_from`/`values`/`GREATER_OR_EQUAL` shape. So imported rules do evaluate today. What remains is the missing import-time guard and the split source of truth. |
| ELIG-02 | Unevaluable rules counted as passes | **Already fixed.** The engine described in the report (`claimActionRunner.ts:229`) no longer exists. `eligibilityEvaluator.ts` records an unevaluable rule as `UNEVALUATED`, and `summariseEligibility` returns `NOT_DETERMINED` (`overall: false`) whenever anything is unevaluated or nothing was evaluated. No fail-open path, no flag needed. |
| ELIG-03 | Editor shows a field the engine never reads | **Valid.** Two registries exist: `eligibility/fieldRegistry.ts` (13 keys, authoritative) and `registries/eligibilityFieldRegistry.ts` (a different list offering `contribution.paid_weeks`, `contribution.recent_paid_weeks`, `survivor.*`, `medical.*` that the authoritative one does not carry), used by `RuleBuilder`, `BlockInspector` and `bnRegistryValidationService`. |
| AMND-01 | New versions get no amendment policy | **Valid and the highest-impact item.** 64 of 87 product versions have no policy row, so every area is locked with no in-app remedy. Unique constraint on `product_version_id` already exists. |
| AMND-02 | Card claims editable while listing locked | **Valid.** `EditabilityBanner.tsx:26` prints the channel blurb regardless of the computed lock state. |

## Blast radius measured

282 of 308 active eligibility rules carry no `rule_definition.field_key`; 230 of those are `severity = BLOCK`. Because the engine already reads `fact_key`, these are not silent passes — but any change that makes `field_key` mandatory would break all of them. The plan therefore keeps `fact_key` a valid input and only adds `field_key` alongside it.
