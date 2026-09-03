import { describe, it, expect } from 'vitest';
import {
  catalogueRuleDefinition,
  resolveCatalogueFieldKey,
  unmappableCatalogueRules,
} from '../catalogueRuleMapping';
import { evaluateEligibilityRules, summariseEligibility } from '../eligibilityEvaluator';

describe('catalogueRuleDefinition (ELIG-01)', () => {
  it('records the engine-readable field_key for a registered fact', () => {
    const def = catalogueRuleDefinition({
      rule_code: 'AGE-62',
      fact_key: 'person.age_at_claim_date',
      operator: 'GREATER_OR_EQUAL',
      value_from: 62,
    });
    expect(def.field_key).toBe('person.age_at_claim_date');
    expect(def.operator).toBe('>=');
  });

  it('keeps every key the catalogue import already wrote', () => {
    const def = catalogueRuleDefinition({
      rule_code: 'X',
      fact_key: 'contribution.total_weeks',
      operator: 'BETWEEN',
      value_from: 100,
      value_to: 200,
      values: null,
    });
    expect(def).toMatchObject({
      parameter: 'X',
      operator: 'BETWEEN',
      value_from: 100,
      value_to: 200,
      window_type: 'LIFETIME',
    });
  });

  it('reports an unregistered fact as unmappable so the import can refuse it', () => {
    expect(resolveCatalogueFieldKey('contribution.total_paid_week_s')).toBeNull();
    expect(resolveCatalogueFieldKey('claimant.age1')).toBeNull();
    const bad = unmappableCatalogueRules([
      { rule_code: 'GOOD', fact_key: 'contribution.total_weeks' },
      { rule_code: 'BAD', fact_key: 'total_weeks_typo' },
      { rule_code: 'NONE', fact_key: null },
    ]);
    expect(bad.map((r) => r.rule_code)).toEqual(['BAD', 'NONE']);
  });
});

describe('eligibility verdict is fail-closed (ELIG-02 regression)', () => {
  it('never reports a pass when nothing could be evaluated', async () => {
    const rules = [
      { rule_code: 'A', rule_name: 'A', severity: 'BLOCK', fail_action: 'REJECT', rule_definition: {} },
      { rule_code: 'B', rule_name: 'B', severity: 'BLOCK', fail_action: 'REJECT', rule_definition: {} },
    ] as any[];
    const traces = await evaluateEligibilityRules(rules, {
      ssn: '000000',
      claimDate: '2026-09-02',
    } as any);
    const summary = summariseEligibility(traces);
    expect(summary.overall).toBe(false);
    expect(summary.verdict).toBe('NOT_DETERMINED');
    expect(summary.passed).toHaveLength(0);
  });
});
