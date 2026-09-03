/**
 * Catalogue → product rule mapping (ELIG-01).
 *
 * The three "add from catalogue" dialogs each built `rule_definition` inline,
 * in the catalogue's own vocabulary, and never wrote `field_key`. The
 * evaluator does resolve a rule's field from the `fact_key` column and its
 * alias table, so those imports are not dead — but the rule then carries no
 * record of WHICH field the engine will actually use, which is exactly what
 * lets the editor display one field while another (or none) is evaluated.
 *
 * This module is the single place that maps a catalogue row onto the shape the
 * engine reads. It is purely additive: every key the previous inline object
 * wrote is still written, with `field_key` (the canonical, alias-resolved key)
 * added alongside. Nothing existing is removed, so the 282 active rules that
 * carry no `field_key` today keep evaluating exactly as they do now.
 */
import { LEGACY_FACT_ALIASES, lookupField } from './ruleFieldMapping';

/** Catalogue operator vocabulary → the engine's operator symbols. */
export const CATALOGUE_OPERATORS: Record<string, string> = {
  GREATER_OR_EQUAL: '>=',
  GREATER_THAN: '>',
  LESS_OR_EQUAL: '<=',
  LESS_THAN: '<',
  EQUALS: '==',
  NOT_EQUALS: '!=',
  BETWEEN: 'BETWEEN',
  IN: 'IN',
  BOOLEAN: '==',
};

export interface CatalogueRuleLike {
  rule_code: string;
  rule_name?: string | null;
  fact_key?: string | null;
  operator?: string | null;
  value_from?: unknown;
  value_to?: unknown;
  values?: unknown;
  window_type?: string | null;
}

/**
 * The canonical registry key a catalogue fact resolves to, or `null` when the
 * platform has no way to evaluate it. Aliases are applied first so a legacy
 * catalogue fact name lands on the key the engine actually knows.
 */
export function resolveCatalogueFieldKey(factKey: string | null | undefined): string | null {
  if (!factKey) return null;
  const trimmed = String(factKey).trim();
  if (!trimmed) return null;
  const canonical = LEGACY_FACT_ALIASES[trimmed] ?? trimmed;
  return lookupField(canonical) ? canonical : null;
}

/** Builds the `rule_definition` written when a catalogue rule is imported. */
export function catalogueRuleDefinition(r: CatalogueRuleLike): Record<string, unknown> {
  const fieldKey = resolveCatalogueFieldKey(r.fact_key);
  const operator = r.operator ? (CATALOGUE_OPERATORS[r.operator] ?? r.operator) : null;
  return {
    // The engine's own contract — recorded so the rule states which field it
    // will be judged on, rather than leaving it to be inferred at run time.
    field_key: fieldKey,
    parameter: r.rule_code,
    operator,
    value_from: r.value_from ?? null,
    value_to: r.value_to ?? null,
    values: r.values ?? null,
    window_type: r.window_type ?? 'LIFETIME',
  };
}

/**
 * Catalogue rules that cannot be evaluated by any registered field. Import is
 * refused for these rather than letting them land as a rule the engine will
 * later report as UNEVALUATED on every claim.
 */
export function unmappableCatalogueRules<T extends CatalogueRuleLike>(rules: T[]): T[] {
  return rules.filter((r) => resolveCatalogueFieldKey(r.fact_key) === null);
}

/** Toast-ready description of the refused rules. */
export function unmappableRuleMessage(rules: CatalogueRuleLike[]): string {
  const names = rules.slice(0, 5).map((r) => `${r.rule_code} (${r.fact_key ?? 'no fact'})`).join(', ');
  const more = rules.length > 5 ? ` and ${rules.length - 5} more` : '';
  return `${names}${more} — the fact is not a registered eligibility field, so the rule could never be evaluated.`;
}
