## What to do now (no code needed)

To batch this payable today, create a batch with method **CHEQUE** and leave the
office unset (or set it to the same office as the payable). It will then appear
in the picker.

## Proposed changes

1. **Explain the empty state.** When the picker returns nothing, show how many
   READY unbatched payables exist overall and why they were excluded (e.g.
   "3 READY payables exist, but none match CHEQUE / HQ"). Add a "show all
   methods/offices" toggle so an officer can see and diagnose without guessing.

2. **Warn earlier in the flow.** On the Payables Queue / Payment Instructions
   view, flag payables that fell back to CHEQUE because the claim has no bank
   account, so the gap is visible before batching.

3. **Stamp office on payables.** Payables are being created with a blank office,
   which makes any office-scoped batch exclude them. Carry the originating
   office onto the instruction at creation, and treat blank office as "matches
   any office" in the picker filter until historical rows are corrected.

## Scope

- Frontend: `AddPayablesDialog.tsx` empty-state and filter toggle.
- Service read path: `fetchAvailablePayables` gains an unfiltered count and a
  relaxed office rule.
- Payable creation: set office code where it is currently left null.
- No changes to batch validation, approval, release, or issue logic.
- Existing payables and batches are untouched; nothing is retro-edited without
  your say-so.
