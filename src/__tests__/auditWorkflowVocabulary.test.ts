import { describe, it, expect } from 'vitest';
import {
  ENGAGEMENT_TRANSITION_STATES,
  ENGAGEMENT_STATES,
  ENGAGEMENT_TERMINAL_STATES,
  FINDING_STATES,
  FINDING_TRANSITIONS,
  ACTION_STATES,
  ACTION_MANAGEMENT_STATES,
  FOLLOWUP_OUTCOMES,
  PLAN_STATES,
  isEngagementTerminal,
  isFindingTerminal,
  isActionTerminal,
  classifyWorkflowState,
} from '@/config/auditWorkflowVocabulary';

/**
 * Stage 2E (DEF-E2E-012) — parity between the frontend workflow contract and
 * the governed server state machines. These expectations mirror the SQL
 * definitions of ia_transition_execution_status, ia_transition_finding,
 * ia_action_* and ia_followup_record_outcome.
 */
describe('IA workflow vocabulary contract', () => {
  it('mirrors ia_transition_execution_status target statuses', () => {
    expect([...ENGAGEMENT_TRANSITION_STATES]).toEqual([
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
    ]);
  });

  it('keeps closure dispositions out of the generic transition set', () => {
    expect(ENGAGEMENT_TRANSITION_STATES).not.toContain('Closed');
    expect(ENGAGEMENT_TRANSITION_STATES).not.toContain('Closed – Actions Pending');
    expect(ENGAGEMENT_TERMINAL_STATES).toContain('Closed');
    expect(ENGAGEMENT_STATES).toContain('Carried Forward');
  });

  it('mirrors ia_transition_finding legal transitions', () => {
    expect(FINDING_TRANSITIONS.Draft).toEqual(['Under Review', 'Withdrawn']);
    expect(FINDING_TRANSITIONS['Under Review']).toEqual(['Confirmed', 'Draft', 'Withdrawn']);
    expect(FINDING_TRANSITIONS.Confirmed).toEqual(['Released', 'Withdrawn']);
    expect(FINDING_TRANSITIONS.Released).toEqual(['Responded', 'Withdrawn']);
    expect(FINDING_TRANSITIONS.Responded).toEqual(['Closed']);
    expect(FINDING_TRANSITIONS.Closed).toEqual([]);
    expect(FINDING_TRANSITIONS.Withdrawn).toEqual([]);
  });

  it('only allows transitions into declared finding states', () => {
    Object.values(FINDING_TRANSITIONS).forEach((targets) => {
      targets.forEach((t) => expect(FINDING_STATES).toContain(t as any));
    });
  });

  it('never lets management self-verify or self-close an action', () => {
    expect(ACTION_MANAGEMENT_STATES).not.toContain('Verified' as any);
    expect(ACTION_MANAGEMENT_STATES).not.toContain('Closed' as any);
    ACTION_MANAGEMENT_STATES.forEach((s) => expect(ACTION_STATES).toContain(s));
  });

  it('mirrors ia_followup_record_outcome outcomes', () => {
    expect([...FOLLOWUP_OUTCOMES]).toEqual([
      'In Verification',
      'Implemented',
      'Partially Implemented',
      'Not Implemented',
      'Reopened',
    ]);
  });

  it('exposes the governed annual plan decision states', () => {
    ['Draft', 'Submitted', 'Under Review', 'Pending Revision Approval', 'Approved', 'Closed'].forEach((s) =>
      expect(PLAN_STATES).toContain(s as any),
    );
  });

  it('classifies terminal states consistently', () => {
    expect(isEngagementTerminal('Closed')).toBe(true);
    expect(isEngagementTerminal('Closed - Actions Pending')).toBe(true);
    expect(isEngagementTerminal('Fieldwork In Progress')).toBe(false);
    expect(isFindingTerminal('Withdrawn')).toBe(true);
    expect(isFindingTerminal('Responded')).toBe(false);
    expect(isActionTerminal('Closed')).toBe(true);
    expect(isActionTerminal('Verification Required')).toBe(false);
  });

  it('classifies canonical, legacy and unknown persisted values', () => {
    expect(classifyWorkflowState('engagement', 'Planned')).toBe('CANONICAL');
    expect(classifyWorkflowState('engagement', 'Findings Raised')).toBe('LEGACY_READABLE');
    expect(classifyWorkflowState('engagement', 'Bananas')).toBe('UNKNOWN');
    expect(classifyWorkflowState('finding', 'Under Review')).toBe('CANONICAL');
    expect(classifyWorkflowState('finding', 'Resolved')).toBe('LEGACY_READABLE');
  });
});
