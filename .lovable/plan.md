# Programme Plan Workbook — SSB Platform Delivery (Phase 1 & Phase 2)

Deliverable: a single Excel workbook you can take offline and manage the programme with. No application or database changes.

Output file: `SSB_Programme_Plan.xlsx` (delivered in chat, downloadable).

## Delivery model captured in the workbook

Each module moves through the same repeatable pipeline:

```text
Build (Lovable) -> Internal Test -> Demo Link to Customer -> Customer Confirmation
   -> .NET Core Transformation (decided per module) -> Final Testing -> Production Go-Live
```

Stage gates are explicit columns so a module cannot be marked "done" without evidence at each gate.

## Phase definition

- Phase 1 = full BEMA functional parity (IP, ER, C3/Contributions, Benefits, Compliance, Legal, Payments, Reference/Master data, Reporting) **plus** enterprise capabilities already built here (Omni-Comms, Internal Audit, governance/master-data convergence, portals already delivered).
- Phase 2 = everything beyond BEMA parity: new online applications (V2), data migration extensions, ID card printing, DMS, advanced analytics, remaining satellite/portal work.
- .NET Core transformation is recorded per module as a decision (Yes / No / Deferred) with a decision date and owner, not assumed for all.

## Workbook sheets

1. **Read Me** — how to use the workbook, stage definitions, gate rules, status legend, colour conventions.
2. **Programme Roadmap** — Phase 1 / Phase 2 module list with start, target end, duration, dependency, phase, overall RAG.
3. **Module Tracker** (the main sheet) — one row per module with:
   - Module, sub-module, phase, BEMA parity flag (Parity / New capability)
   - Module Lead (named), Backup, QA owner, Migration owner — plus a parallel role-only column set so the sheet works with or without names
   - Stage columns: Build %, Internal Test, Demo Link, Demo Date, Customer Confirmation, .NET Decision, .NET Build, Final Test, Production
   - Dates: planned start/end, actual start/end per stage-gate
   - Status, RAG, blockers, notes
4. **Owners & Roles** — the named team from the whiteboard mapped to modules and roles (Kalash, Manoj, Ashi, Hari, Harsh, Sian, Salil, Anish, Saumya, Iram, Sanchit, Mukul, Amitesh, Vidya, Bharat, Anil, Kajal), each with a role-only equivalent (Module Lead / Dev / QA / Migration / Security / Workflow / Comms).
5. **Stage Gate Checklist** — per module, the evidence required to pass each gate (test evidence, demo link, customer sign-off reference, migration reconciliation, security check, production checklist).
6. **Demo & Confirmation Log** — demo date, audience, link shared, feedback, decision (Confirmed / Changes Requested), re-demo date.
7. **.NET Transformation Register** — per module: decision, rationale, target API/service, parity test set, cutover approach, rollback, status.
8. **Data Migration Tracker** — per legacy area: source, mapping status, dry-run count, reconciliation status, sign-off.
9. **Risks & Issues (RAID)** — ID, type, description, owner, impact, likelihood, mitigation, due date, status.
10. **Dashboard** — formula-driven rollups: modules per phase, count by stage, % confirmed by customer, % transformed to .NET, RAG summary, blocker count. All values are live Excel formulas (COUNTIF/COUNTIFS), no hardcoded numbers, so it updates as you edit the tracker.

## Conventions applied

- Blue text = inputs you edit; black = formulas; yellow fill = needs decision.
- Dropdown data validation on Status, RAG, Phase, Stage, and .NET Decision so the dashboard rollups stay accurate.
- Frozen header rows, filters on every register sheet, consistent Arial formatting, dates as DD-MMM-YYYY.

## Seeding

Module and sub-module rows are seeded from what actually exists in this repository (Benefits, Compliance & Enforcement, Legal, Internal Audit, Contributions/C3, Employer, Insured Person, Omni-Comms, Organisation Management, Platform Admin, Portals) so the tracker starts populated rather than empty. Dates are left blank for you to fill.

## Not in scope of this task

- No in-app tracker module, no tables, no code changes.
- No commitments on durations or resourcing — the workbook provides the structure; you set the dates offline.

## Also pending (needs build mode)

Two staged database migrations from an accepted draft are waiting to be applied and cannot run in plan mode:

- `20260903053000_bn_seed_amendment_policy.sql` — auto-creates the amendment policy row for every benefit product version (plus backfill), unlocking amendment areas that are currently locked.
- `20260903090000_bn_award_setup_payment_handoff_guard.sql` — award setup / payment hand-off guard.

Approve this plan (or switch to build mode) and I will apply both, then produce the workbook.
