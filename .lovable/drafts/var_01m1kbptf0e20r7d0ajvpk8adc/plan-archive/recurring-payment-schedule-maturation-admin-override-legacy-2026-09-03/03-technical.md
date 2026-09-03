# Technical detail

## Maturation

- New governed function `bn_mature_payment_schedule(p_as_of date default current_date)` (SECURITY DEFINER, fixed `search_path`), staged as an additive migration:
  - `PROJECTED → DUE` where `due_date <= p_as_of`, award status in ACTIVE/REINSTATED, entitlement active, row not SUSPENDED/SKIPPED/CANCELLED.
  - For each `DUE` row without a linked instruction: insert into `bn_payment_instruction` (amount from `amount`/`gross_amount`, `payment_method` and bank snapshot from `bn_payment_profile`, cheque fallback when no bank account, `office_code` default HQ, `status` per existing payables vocabulary), then set the row to `GENERATED` and write `bn_payment_schedule.bn_payment_instruction_id`.
  - Idempotency: skip any period that already has a non-cancelled instruction for the same award + `schedule_period`.
  - Returns per-row outcome (`matured`, `generated`, `skipped` + reason) and writes audit rows through the existing Benefits audit helper.
- Daily `pg_cron` entry at 02:00 UTC calling the function — one job per day, not a sweeper. Cost impact is negligible at this cadence; maximum delay for a newly due period is under 24 hours.
- `scheduleService.ts`: `GENERATE_INSTRUCTION` delegates to the RPC instead of only flipping status; add `runScheduleMaturation()` and expose it in `PaymentScheduleManagement.tsx` as a "Run maturation now" button (supervisor/manager/director/admin) with a result summary.
- No new payment table, no new dispatch path — payables continue through `payablesQueueService` and `batchOperationsService`.

## Admin override

- Reuse the server-side admin resolution already added in `batchOperationsService.currentUserIsAdmin` (backed by `is_admin`), promoted into a shared `src/services/bn/bnActorService.ts` helper with a cached async `isBenefitsAdmin()`.
- Replace hardcoded role-list checks in `scheduleService.ts`, `payablesQueueService.ts`, `entitlementService.ts`, `approvalConsoleService.ts`, `claimWorkbenchService.ts` and `batchOperationsService.ts` with a common `canPerform(action, userRoles)` that short-circuits to true for admins, and normalises role names case-insensitively so `Admin` matches `ADMIN`.
- Remove the creator self-approval exception for admins (approve/release/issue), keep it for all other roles.
- Each admin bypass writes an audit entry with `override_reason: 'ADMIN_FULL_PRIVILEGE'`.

## Legacy row reconciliation (data only, this claim)

- Link schedule row `be778a0d-089c-4133-a167-92fd6fef1226` to instruction `6d9030f6-954e-4011-ab2d-b829570b66ff`, set status `GENERATED`, `payment_ref = FCB2000001`, `paid_at` from the instruction, `net_amount = 255.00`.
- Cancel-as-superseded is not applied; the four PROJECTED rows are untouched. Because the September projected row (seq 1, 2026-09-03) now resolves to an already-issued period, the maturation idempotency check will skip it rather than create a second payable — verified before the job is scheduled.
- No existing payment, cheque, batch or issue record is modified.

## Verification

- Unit tests for maturation: due/not-due, suspended, cancelled, inactive award, duplicate-period skip, cheque vs bank routing.
- Admin-override tests: admin passes every Benefits gate including self-approval; non-admin gates unchanged.
- Manual E2E on BN-20260903-07443: run maturation, confirm exactly one new payable for the October period, confirm no duplicate for September, confirm claim remains IN_PAYMENT.
- Typecheck, build, and the Benefits test suite.
