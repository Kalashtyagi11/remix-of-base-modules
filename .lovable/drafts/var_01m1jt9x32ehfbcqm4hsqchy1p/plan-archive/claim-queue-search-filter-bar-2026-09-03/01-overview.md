# Claim Queue — Search & Filter Bar

## Goal
The workbasket table on the **Claim Queue** page (`/bn/claims/queue`) currently shows every claim in the selected basket with no way to find one. Add a filter section above the table so an officer can search and narrow the list.

## What changes
One file: `src/pages/bn/claims/ClaimQueue.tsx` (frontend only, no database or backend changes).

A filter bar appears above the selected basket's claim table with:

1. **Search box** — matches (case-insensitive, partial) against:
   - Claim number (e.g. `BN-20260827-44372`)
   - SSN
   - Assigned-to officer code
2. **Status filter** — dropdown of the claim statuses present in the basket (INTAKE, ELIGIBILITY_CHECK, etc.).
3. **Priority filter** — All / High (P1–P2) / Normal (P3–P4) / Low (P5+).
4. **Assignment filter** — All / Unassigned / Assigned to me.
5. **Clear button** — resets all filters.

Filtering is client-side over the claims already loaded for the selected basket, so it is instant and respects the existing role/basket security model — no new data access. The same search text also narrows the "My Assigned Claims" table at the top of the page.

## Behaviour details
- Filters reset when you switch baskets or switch between My baskets / All baskets.
- When filters hide everything, the table shows "No claims match the current filters" instead of an empty grid.
- A small result count appears, e.g. "Showing 3 of 45 claims".
- Overdue highlighting, Pick/Release actions, and stage/queue mismatch badges are unchanged.
