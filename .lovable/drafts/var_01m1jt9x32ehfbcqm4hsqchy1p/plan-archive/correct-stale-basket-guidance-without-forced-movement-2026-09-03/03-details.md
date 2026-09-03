## Implementation

1. Remove the workbench reroute mutation and **Move to the correct basket** button.
2. Make the active-basket query refetch on mount and window focus, and ensure lifecycle success invalidates/refetches that exact query.
3. Keep mismatch detection as read-only diagnostics after fresh data is loaded; do not evaluate a mismatch while the query is loading or stale.
4. Update the message to direct staff to complete the governed lifecycle action or contact an administrator if routing failed—never to force assignment.
5. Add focused tests for:
   - `IN_PAYMENT` + active Payment Issue → normal Payment Issue guidance.
   - stale/loading basket state → no false mismatch warning.
   - genuine mismatch → warning without a move button.
6. Run typecheck, focused tests, preview build verification, and change-impact review.

## Scope

Frontend behavior only. Existing automatic status-to-basket routing remains unchanged. No claim data, assignments, tables, policies, or backend functions will be modified.
