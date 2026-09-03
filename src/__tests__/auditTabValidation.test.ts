import { describe, it, expect } from 'vitest';
import {
  type IaValidationIssue,
  errorCountsByTab,
  fieldErrorMap,
  fieldAnchorId,
  getFirstInvalidTab,
  issuesForTab,
  mapServerErrorToIssue,
  restrictedIssues,
  summariseIssues,
  tabForField,
} from '@/lib/audit/tabValidation';

const TABS = [
  { id: 'identity', label: 'Identity & Coverage' },
  { id: 'planning', label: 'Planning Narrative' },
  { id: 'team', label: 'Team & Ownership' },
  { id: 'schedule', label: 'Schedule & Resources' },
];
const ORDER = TABS.map(t => t.id);

const issues: IaValidationIssue[] = [
  { field: 'estimated_days', tabId: 'schedule', message: 'Estimated days is required' },
  { field: 'engagement_name', tabId: 'identity', message: 'Audit title is required' },
  { field: 'planned_end_date', tabId: 'schedule', message: 'Planned start date must be before end date' },
];

describe('IA tab-aware validation contract (IA-UX-VAL-001)', () => {
  it('routes to the first invalid tab in declared tab order, not in error order', () => {
    // The schedule issue was raised first, but Identity comes first in tab order.
    expect(getFirstInvalidTab(issues, ORDER)).toBe('identity');
  });

  it('is deterministic: fixing the first blocker advances to the next one', () => {
    const remaining = issues.filter(i => i.field !== 'engagement_name');
    expect(getFirstInvalidTab(remaining, ORDER)).toBe('schedule');
  });

  it('never deep-links a persona into a tab it may not act on', () => {
    const restricted: IaValidationIssue[] = [
      { field: 'qa_conclusion', tabId: 'quality', message: 'Quality review outstanding', restricted: true },
      { field: 'estimated_days', tabId: 'schedule', message: 'Estimated days is required' },
    ];
    expect(getFirstInvalidTab(restricted, ['quality', 'schedule'])).toBe('schedule');
    expect(restrictedIssues(restricted)).toHaveLength(1);
  });

  it('returns null when nothing is actionable', () => {
    expect(getFirstInvalidTab([], ORDER)).toBeNull();
  });

  it('counts blocking errors per tab for tab badges', () => {
    expect(errorCountsByTab(issues)).toEqual({ schedule: 2, identity: 1 });
  });

  it('excludes warnings from tab badge counts', () => {
    const withWarning: IaValidationIssue[] = [
      ...issues,
      { field: 'scope', tabId: 'planning', message: 'Scope is short', severity: 'warning' },
    ];
    expect(errorCountsByTab(withWarning).planning).toBeUndefined();
  });

  it('scopes issues to a single tab for local save semantics', () => {
    expect(issuesForTab(issues, 'planning')).toHaveLength(0);
    expect(issuesForTab(issues, 'schedule')).toHaveLength(2);
  });

  it('produces a field-level error map for inline rendering', () => {
    expect(fieldErrorMap(issues).engagement_name).toBe('Audit title is required');
  });

  it('summarises across sections', () => {
    expect(summariseIssues(issues, TABS)).toBe('3 items need attention across 2 sections.');
    expect(summariseIssues([issues[0]], TABS)).toBe('1 item needs attention across 1 section.');
    expect(summariseIssues([], TABS)).toBe('');
  });

  it('uses a stable anchor id for scroll and focus routing', () => {
    expect(fieldAnchorId('estimated_days')).toBe('ia-field-estimated_days');
  });

  it('resolves the owning tab with a fallback', () => {
    expect(tabForField({ estimated_days: 'schedule' }, 'estimated_days', 'identity')).toBe('schedule');
    expect(tabForField({}, 'mystery_field', 'identity')).toBe('identity');
  });

  it('routes known governed server errors to their owning tab and preserves the message', () => {
    const routes = [
      { match: 'IA_INVALID_DEPARTMENT', field: 'department_id', tabId: 'identity' },
      { match: 'IA_FISCAL', field: 'planned_start_date', tabId: 'schedule' },
    ];
    const issue = mapServerErrorToIssue(
      { code: 'P0001', message: 'IA_FISCAL_OUT_OF_RANGE: start date is outside the fiscal year' },
      routes,
      'identity',
    );
    expect(issue?.tabId).toBe('schedule');
    expect(issue?.field).toBe('planned_start_date');
    expect(issue?.message).toContain('IA_FISCAL_OUT_OF_RANGE');
  });

  it('falls back without losing an unmapped server message', () => {
    const issue = mapServerErrorToIssue({ code: '42501', message: 'IA_USE_GOVERNED_COMMAND' }, [], 'identity');
    expect(issue?.tabId).toBe('identity');
    expect(issue?.message).toBe('IA_USE_GOVERNED_COMMAND');
  });

  it('returns null when there is no server error', () => {
    expect(mapServerErrorToIssue(null, [], 'identity')).toBeNull();
  });
});
