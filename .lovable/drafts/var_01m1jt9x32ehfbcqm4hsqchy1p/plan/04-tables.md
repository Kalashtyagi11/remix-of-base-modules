## Tables involved

Only two tables are touched, and only additively.

| Table | Change | Why |
|---|---|---|
| `bn_product_amendment_policy` | Rows inserted — one per product version (64 backfilled, then one per new version via trigger). No column, type or constraint change; the unique key on `product_version_id` already exists. | AMND-01: a version with no policy row locks every amendment area. |
| `bn_product_version` | New `AFTER INSERT` trigger only. No column change, no data change to existing rows. | Seeds the policy row on every creation path (manual create, clone-to-draft, import). |

Read-only, no writes:

- `bn_eligibility_rule` — read for the reconciliation report of rules whose `fact_key` is not a registered field. Newly imported rules will simply carry an extra `field_key` inside the existing `rule_definition` JSON; no existing row is rewritten and no column is added.
- `bn_rule_catalogue` / catalogue rule sources — read only, by the import dialogs.
- `bn_claim_eligibility` — unchanged; the evaluator and its verdict states stay as they are.

Because this draft shares the live database, the trigger and backfill apply when the draft is accepted, not while you preview it.
