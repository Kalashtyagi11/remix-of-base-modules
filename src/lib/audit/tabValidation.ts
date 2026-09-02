/**
 * Internal Audit — Tab-aware validation contract (IA-UX-VAL-001).
 *
 * Multi-tab Internal Audit data-entry surfaces previously ran a single global
 * validator and surfaced `errors[0]` in a toast. When the first failure belonged
 * to a hidden tab, the user was misdirected: the message named a field they
 * could not see and the UI stayed on the current tab.
 *
 * This module is the shared, presentation-level contract used by every tabbed
 * IA form. It does NOT own business rules and it is NOT authority — governed
 * server commands remain authoritative (Stage 2E). Its only job is to answer:
 *
 *   - which tab owns this failure?
 *   - which tab should the user be taken to?
 *   - which control should receive focus?
 *
 * Design rules:
 *  - Local save (`scope: 'local'`) validates the active tab plus the genuine
 *    global minimum required to persist the record.
 *  - Whole-record / workflow actions (`scope: 'record'`) may validate every tab,
 *    but MUST route the user to the first actionable failing tab.
 *  - A failure the current persona may not act on is reported as a safe blocker
 *    instead of deep-linking them into an unauthorised tab.
 */

export type IaValidationSeverity = 'error' | 'warning';

export interface IaValidationIssue {
  /** Form field key. Also used as the DOM anchor id: `ia-field-<field>`. */
  field: string;
  /** Tab that owns the field. */
  tabId: string;
  message: string;
  severity?: IaValidationSeverity;
  /**
   * Which action the issue blocks. `save` blocks any persistence, `submit`
   * blocks only the whole-record/workflow action (deferred validation).
   */
  blockingAction?: 'save' | 'submit';
  /**
   * Set when the owning tab is not available to the current persona. The UI
   * must show a safe blocker rather than navigating there.
   */
  restricted?: boolean;
}

export interface IaTabDescriptor {
  id: string;
  label: string;
}

/** Field key → owning tab id. */
export type IaFieldTabMap = Record<string, string>;

/** Resolve the owning tab for a field, defaulting to the first tab. */
export function tabForField(map: IaFieldTabMap, field: string, fallbackTabId: string): string {
  return map[field] ?? fallbackTabId;
}

/** Issues that belong to a single tab. */
export function issuesForTab(issues: IaValidationIssue[], tabId: string): IaValidationIssue[] {
  return issues.filter((i) => i.tabId === tabId);
}

/** Blocking-error count per tab, for tab badges. */
export function errorCountsByTab(issues: IaValidationIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    if ((issue.severity ?? 'error') !== 'error') return acc;
    acc[issue.tabId] = (acc[issue.tabId] ?? 0) + 1;
    return acc;
  }, {});
}

/** Field → first message, for inline rendering. */
export function fieldErrorMap(issues: IaValidationIssue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    if (!map[issue.field]) map[issue.field] = issue.message;
  }
  return map;
}

/**
 * First invalid tab in declared tab order (deterministic: fixing the first
 * blocker always advances to the next one). Restricted tabs are skipped so the
 * user is never deep-linked into an area they may not see.
 */
export function getFirstInvalidTab(
  issues: IaValidationIssue[],
  tabOrder: readonly string[],
): string | null {
  const actionable = issues.filter((i) => !i.restricted && (i.severity ?? 'error') === 'error');
  for (const tabId of tabOrder) {
    if (actionable.some((i) => i.tabId === tabId)) return tabId;
  }
  return null;
}

/** Issues the current persona cannot act on. */
export function restrictedIssues(issues: IaValidationIssue[]): IaValidationIssue[] {
  return issues.filter((i) => i.restricted);
}

/** Stable DOM anchor id for a field, used for scroll + focus routing. */
export function fieldAnchorId(field: string): string {
  return `ia-field-${field}`;
}

/**
 * Scroll to and focus the first invalid control on a tab. Runs after the tab
 * has been activated, so the element exists and is visible. Focus moves to a
 * real form control where one exists, otherwise to the labelled wrapper, which
 * keeps keyboard and screen-reader users oriented.
 */
export function focusFirstInvalidField(issues: IaValidationIssue[], tabId: string): void {
  const target = issues.find((i) => i.tabId === tabId && !i.restricted);
  if (!target) return;
  // Defer past the tab content mount.
  requestAnimationFrame(() => {
    const anchor = document.getElementById(fieldAnchorId(target.field));
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const control = anchor.matches('input, select, textarea, button')
      ? (anchor as HTMLElement)
      : anchor.querySelector<HTMLElement>('input, select, textarea, [role="combobox"], button');
    (control ?? anchor).focus?.({ preventScroll: true });
  });
}

/** Human summary for the form-level panel, e.g. "3 items need attention across 2 sections". */
export function summariseIssues(issues: IaValidationIssue[], tabs: readonly IaTabDescriptor[]): string {
  const errors = issues.filter((i) => (i.severity ?? 'error') === 'error');
  if (errors.length === 0) return '';
  const sections = new Set(errors.map((i) => i.tabId));
  const sectionWord = sections.size === 1 ? 'section' : 'sections';
  const itemWord = errors.length === 1 ? 'item needs' : 'items need';
  void tabs;
  return `${errors.length} ${itemWord} attention across ${sections.size} ${sectionWord}.`;
}

/**
 * Deterministic mapping of known governed server errors onto a field/tab so a
 * rejected RPC lands the user in the right place. The server message is always
 * preserved — this only adds routing.
 */
export interface IaServerErrorRoute {
  /** Substring or code matched against the server error message/code. */
  match: string;
  field: string;
  tabId: string;
}

export function mapServerErrorToIssue(
  error: { code?: string | null; message?: string | null } | null | undefined,
  routes: readonly IaServerErrorRoute[],
  fallbackTabId: string,
): IaValidationIssue | null {
  if (!error) return null;
  const haystack = `${error.code ?? ''} ${error.message ?? ''}`.toUpperCase();
  if (!haystack.trim()) return null;
  const route = routes.find((r) => haystack.includes(r.match.toUpperCase()));
  return {
    field: route?.field ?? '__server__',
    tabId: route?.tabId ?? fallbackTabId,
    // Server governance message is preserved verbatim.
    message: error.message ?? 'The server rejected this change.',
    severity: 'error',
    blockingAction: 'save',
  };
}
