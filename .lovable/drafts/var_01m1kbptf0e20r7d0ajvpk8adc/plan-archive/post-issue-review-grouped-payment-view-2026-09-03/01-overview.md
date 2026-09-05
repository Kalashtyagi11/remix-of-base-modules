# Post-Issue Review — Grouped Payment View

## What the user observed
On `/bn/post-issue`, the same claim (BN-20260903-07443 / cheque FCB2000001) appears once per checklist task (9 times). This is correct data — each row is a distinct post-issue activity — but reads as duplication.

## Goal
Restructure the list so each **issued payment appears once**, with its checklist tasks nested underneath.

## Current state (verified)
- `bn_post_issue_task` holds 9 tasks for this issue record; 36 tasks across 4 issued records. No duplicates.
- `PostIssueReview.tsx` renders a flat `PostIssueTaskList` — one table row per task.
- 12 task types are defined; 9 apply to this claim (Survivor Follow-up, Holding Follow-up, Claim Closure correctly excluded).

## Proposed change (UI only)
1. **Group tasks by issue record** in `PostIssueTaskList.tsx`: one parent row per payment showing claim number, cheque/DD reference, amount, method, issue date, and a task progress summary (e.g. "0 / 9 complete", required-tasks status).
2. **Expandable rows**: clicking a payment row expands to show its tasks (existing per-task row content and actions unchanged — execute, retry, skip, defer, cancel still live at task level).
3. **Keep filters working**: filtering by status / task type / search filters the tasks; parent rows show only groups with matching tasks, with non-matching tasks hidden inside expanded groups.
4. **Summary cards unchanged** (counts still computed over tasks, not groups).

## No changes to
- Task generation, task definitions, statuses, transitions, or role permissions.
- Database schema — presentation-only change.

## Verification
- Reload `/bn/post-issue`: 4 payment rows (one per issued record), FCB2000001 appears once; expanding it shows exactly 9 tasks.
- Search `FCB2000001` → 1 grouped row, 9 tasks inside.
- Existing task actions still work from the expanded view.
