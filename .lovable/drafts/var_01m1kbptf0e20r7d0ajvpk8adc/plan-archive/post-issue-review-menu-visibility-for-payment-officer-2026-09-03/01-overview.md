# Post-Issue Review menu visibility for Payment Officer

## What is wrong

The Benefit Payments menu is built from module access grants, not from code. Every sibling screen in that group (Payment Schedules, Payables Queue, Batch Operations, Payment Issue) is granted to **Admin, BN_FINANCE_SUPERVISOR, BN_PAYMENT_OFFICER**.

**Post-Issue Review is the only one with no grants at all** — it has no `view` action defined and no role permission rows. Result: only administrators see it. The user `benefits.payment@mishainfotech.com` holds exactly one role, `BN_PAYMENT_OFFICER`, so the menu is hidden for them even though the route and page work.

## About the "Closure" basket

There is no Closure workbasket in the system, and none is planned in this change. Baskets stop at Payment Issue: a claim in `IN_PAYMENT` stays in the Payment Issue basket, and once closed it is terminal and belongs to no basket. Closure is a **task type** (`CLAIM_CLOSURE`) inside the Post-Issue Review screen — so once the menu is visible, the closure work becomes reachable there.
