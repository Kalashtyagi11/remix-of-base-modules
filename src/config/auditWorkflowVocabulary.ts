/**
 * INTERNAL AUDIT — STAGE 2E (DEF-E2E-012)
 * Canonical workflow vocabulary contract.
 *
 * Class C — GOVERNED_WORKFLOW_VOCABULARY.
 * These values are NOT administrator-maintainable reference/master data. They are a
 * typed UI mirror of the governed server state machines:
 *
 *   Engagement      : ia_transition_execution_status / ia_launch_engagement /
 *                     ia_close_engagement / ia_cancel_engagement / ia_postpone_engagement
 *   Finding         : ia_transition_finding
 *   Corrective Act. : ia_action_submit_completion / ia_action_start_verification /
 *                     ia_action_verify / ia_action_reject_verification /
 *                     ia_action_close_v2 / ia_action_cancel / ia_action_reopen
 *   Follow-Up       : ia_followup_schedule / ia_followup_record_outcome
 *   Annual Plan     : ia_submit_annual_plan / ia_decide_annual_plan /
 *                     ia_close_annual_plan / ia_reopen_annual_plan
 *   Report          : ia_create_report_version / ia_issue_report
 *   QA              : ia_start_quality_review / ia_conclude_quality_review
 *
 * The server is authority. This module exists only so UI surfaces stop retyping
 * divergent local string arrays. Never add a state here that no governed command
 * can enter, and never use these constants to write a status directly.
 */

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

/** Statuses enterable through ia_transition_execution_status. */
export const ENGAGEMENT_TRANSITION_STATES = [
  'Planned',
  'Ready for Launch',
  'Notification Sent',
  'Opening Meeting Scheduled',
  'Fieldwork In Progress',
  'Findings Drafting',
  'Management Response Pending',
  'Final Report Issued',
  'Follow-up Monitoring',
  'Deferred',
  'Cancelled',
] as const;

/** Terminal dispositions — only reachable through governed closure/cancel/plan-close. */
export const ENGAGEMENT_TERMINAL_STATES = [
  'Closed',
  'Closed – Actions Pending',
  'Carried Forward',
  'Cancelled',
] as const;

/** Full canonical engagement vocabulary (transitionable ∪ terminal). */
export const ENGAGEMENT_STATES = [
  ...ENGAGEMENT_TRANSITION_STATES.filter((s) => s !== 'Cancelled'),
  ...ENGAGEMENT_TERMINAL_STATES,
] as const;

/**
 * Historical values still present on legacy rows. Readable, never enterable.
 * (Includes the en-dash variant written by older code.)
 */
export const ENGAGEMENT_LEGACY_STATES = [
  'Closed - Actions Pending',
  'Draft',
  'Ready',
  'In Preparation',
  'In Progress',
  'Findings Raised',
  'Management Response',
  'Completed',
  'Archived',
] as const;

export type EngagementState = (typeof ENGAGEMENT_STATES)[number];

export const isEngagementTerminal = (status?: string | null): boolean =>
  !!status &&
  ([...ENGAGEMENT_TERMINAL_STATES, 'Closed - Actions Pending', 'Archived'] as string[]).includes(status);

/* ------------------------------------------------------------------ */
/* Finding                                                             */
/* ------------------------------------------------------------------ */

export const FINDING_STATES = [
  'Draft',
  'Under Review',
  'Confirmed',
  'Released',
  'Responded',
  'Closed',
  'Withdrawn',
] as const;

export const FINDING_TERMINAL_STATES = ['Closed', 'Withdrawn'] as const;

/** Legal transitions enforced by ia_transition_finding. */
export const FINDING_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: ['Under Review', 'Withdrawn'],
  'Under Review': ['Confirmed', 'Draft', 'Withdrawn'],
  Confirmed: ['Released', 'Withdrawn'],
  Released: ['Responded', 'Withdrawn'],
  Responded: ['Closed'],
  Closed: [],
  Withdrawn: [],
};

/**
 * Historical/legacy finding values (finding.status column of older rows).
 * `In Review` / `Submitted for Response` / `Open` / `Resolved` are NOT proven
 * aliases of the governed lifecycle — they are pre-Wave-2 descriptive values and
 * remain readable only.
 */
export const FINDING_LEGACY_STATES = [
  'Open',
  'In Review',
  'Submitted for Response',
  'Resolved',
  'In Progress',
] as const;

export type FindingState = (typeof FINDING_STATES)[number];

export const isFindingTerminal = (status?: string | null): boolean =>
  !!status && (FINDING_TERMINAL_STATES as readonly string[]).includes(status);

/* ------------------------------------------------------------------ */
/* Corrective Action                                                   */
/* ------------------------------------------------------------------ */

export const ACTION_STATES = [
  'Open',
  'Assigned',
  'In Progress',
  'Verification Required',
  'Returned',
  'Reopened',
  'Verified',
  'Closed',
  'Cancelled',
] as const;

export const ACTION_TERMINAL_STATES = ['Closed', 'Cancelled'] as const;

/**
 * States that management (the accountable owner) may enter itself.
 * Management can never enter `Verified` or `Closed` — governed segregation of
 * duties in ia_action_submit_completion / ia_action_verify / ia_action_close_v2.
 */
export const ACTION_MANAGEMENT_STATES = ['In Progress', 'Verification Required'] as const;

/** States only an independent auditor/verifier can enter. */
export const ACTION_AUDITOR_STATES = ['Returned', 'Verified', 'Closed', 'Cancelled', 'Reopened'] as const;

export type ActionState = (typeof ACTION_STATES)[number];

export const isActionTerminal = (status?: string | null): boolean =>
  !!status && ([...ACTION_TERMINAL_STATES, 'Superseded'] as string[]).includes(status);

/* ------------------------------------------------------------------ */
/* Follow-Up (lifecycle + outcome are distinct from Follow-Up Type)    */
/* ------------------------------------------------------------------ */

export const FOLLOWUP_STATES = ['Scheduled', 'In Verification', 'Implemented', 'Reopened'] as const;

/** Outcome vocabulary enforced by ia_followup_record_outcome. */
export const FOLLOWUP_OUTCOMES = [
  'In Verification',
  'Implemented',
  'Partially Implemented',
  'Not Implemented',
  'Reopened',
] as const;

export const FOLLOWUP_OUTCOMES_REQUIRING_NOTES = ['Partially Implemented', 'Not Implemented'] as const;

/* ------------------------------------------------------------------ */
/* Annual Plan                                                         */
/* ------------------------------------------------------------------ */

export const PLAN_STATES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Pending Revision Approval',
  'Changes Requested',
  'Rejected',
  'Approved',
  'Closed',
] as const;

export const PLAN_TERMINAL_STATES = ['Closed'] as const;
export const PLAN_IMMUTABLE_STATES = ['Approved', 'Closed'] as const;
export const PLAN_LEGACY_STATES = ['Active', 'Superseded', 'Archived', 'Removed'] as const;

export type PlanState = (typeof PLAN_STATES)[number];

/* ------------------------------------------------------------------ */
/* Report / QA                                                         */
/* ------------------------------------------------------------------ */

export const REPORT_STATES = ['Draft', 'Issued'] as const;
export const QA_STATES = ['In Review', 'Cleared', 'Rework Required', 'Superseded'] as const;

/* ------------------------------------------------------------------ */
/* Activities (engagement fieldwork tasks — not a governed lifecycle)  */
/* ------------------------------------------------------------------ */

export const ACTIVITY_STATES = ['Planned', 'In Progress', 'Completed', 'Deferred', 'Cancelled'] as const;

/* ------------------------------------------------------------------ */
/* Health helpers                                                      */
/* ------------------------------------------------------------------ */

export const WORKFLOW_DOMAINS = {
  engagement: {
    label: 'Engagement',
    canonical: ENGAGEMENT_STATES as readonly string[],
    legacy: ENGAGEMENT_LEGACY_STATES as readonly string[],
  },
  finding: {
    label: 'Finding',
    canonical: FINDING_STATES as readonly string[],
    legacy: FINDING_LEGACY_STATES as readonly string[],
  },
  action: {
    label: 'Corrective Action',
    canonical: ACTION_STATES as readonly string[],
    legacy: ['Completed', 'Completed by Management', 'In Verification', 'Superseded'] as readonly string[],
  },
  plan: {
    label: 'Annual Plan',
    canonical: PLAN_STATES as readonly string[],
    legacy: PLAN_LEGACY_STATES as readonly string[],
  },
} as const;

export type WorkflowDomainKey = keyof typeof WORKFLOW_DOMAINS;

export function classifyWorkflowState(domain: WorkflowDomainKey, value?: string | null) {
  const d = WORKFLOW_DOMAINS[domain];
  if (!value) return 'UNKNOWN' as const;
  if (d.canonical.includes(value)) return 'CANONICAL' as const;
  if (d.legacy.includes(value)) return 'LEGACY_READABLE' as const;
  return 'UNKNOWN' as const;
}
