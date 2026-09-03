# Technical Details

## File touched
- `src/pages/bn/claims/ClaimQueue.tsx` — only file modified. No backend, RPC, RLS, or migration.

## Implementation
- Add state: `searchText`, `statusFilter`, `priorityFilter`, `assignmentFilter`.
- Derive `filteredClaims` with a `useMemo` over the existing `queueClaims` array (search matches `claim_number`, `ssn`, `assigned_to` via lowercase `includes`).
- Status dropdown options derived from the statuses actually present in the loaded claims.
- Apply the same `searchText` to the "My Assigned Claims" (`myQueue`) table.
- Reset filters in the existing `openBasket` handler and the scope switch buttons.
- Empty-filtered state and "Showing X of Y claims" count.
- UI built from existing shadcn components (`Input`, `Select`, `Button`) and design tokens — no hardcoded colors.

## Out of scope
- Server-side search across all claims (the queue already loads only the selected basket's claims; filtering them client-side is instant).
- Saved filters or URL persistence.
- The mock-data `WorklistsHome` page (not the screen in your screenshot).

## Verification
- Typecheck and build.
- Manual check: type a claim number fragment (e.g. `44372`), an SSN, and a status filter; confirm rows narrow, the count updates, and Clear restores the full list.
