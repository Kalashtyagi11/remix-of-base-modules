# Verify Claim Queue Workbasket Filters

The filter bar (status, priority, assignment, clear-filters, result counter) was committed to main today in `src/pages/bn/claims/ClaimQueue.tsx` and is present in this draft. This wave is **verification only — no code or data changes**.

## Steps

1. Open the Claim Queue page in the preview and confirm the filter bar renders above the loaded basket.
2. Apply each filter (status, priority, assignment) and confirm:
   - The list narrows client-side.
   - The "Showing X of Y claims" counter updates correctly.
   - "No claims match the current filters" appears for empty results.
3. Confirm "Clear filters" restores the full basket.
4. Confirm filters behave correctly when switching workbaskets (filters reset or apply consistently).
5. Run the existing Benefit Management tests touching the claim queue to confirm no regression.

## Out of scope

- No new filter features, no backend changes, no database changes.
- Any defect found is reported first; a fix is planned separately.
