# Post-Issue Review shows nothing

## What I found

Post-Issue Review reads its work list from the post-issue task table. That table is **completely empty** (0 rows), while 4 payments are recorded as issued — including the cheque FCB2000001 for BN-20260903-07443 issued this morning.

The task-generation routine exists and is correct, but **nothing ever calls it**. It is exposed through a hook that no screen or service uses, and the issue flow (both batch issue and single issue) creates the issue record without ever asking for the follow-up tasks to be created. So every payment issued so far has left the post-issue checklist blank, and the screen has nothing to display.

This is not a filter or permission problem: the list is unfiltered by default, and the underlying table has no rows at all.
