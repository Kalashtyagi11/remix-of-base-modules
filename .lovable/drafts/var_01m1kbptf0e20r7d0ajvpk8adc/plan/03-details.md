## The change

Grant Post-Issue Review the same access as Payment Issue: **Admin, BN_FINANCE_SUPERVISOR, BN_PAYMENT_OFFICER**.

Staged as an additive, idempotent migration (applies when this draft is accepted):

1. Insert an enabled `view` action for the `bn_post_issue` module if it does not already exist.
2. Insert granted `role_permissions` rows for that module + view action for the roles `Admin`, `BN_FINANCE_SUPERVISOR`, `BN_PAYMENT_OFFICER`, guarded so re-running changes nothing.
3. Leave the hidden `bn_post_issue_enhanced` module untouched (it is not a menu item).

No code, route, RLS, business-logic or workbasket changes. No workbasket is created and no claim routing is altered.

## Verification

- Confirm `get_user_accessible_modules` returns Post-Issue Review for the Payment Officer user.
- Confirm the grant list for `/bn/post-issue` now matches `/bn/issue`.
- Confirm Admin visibility and other menus are unchanged.

## Note

Because this is a draft, the grant takes effect when the draft is accepted; the menu will appear after the user re-signs in or refreshes.
