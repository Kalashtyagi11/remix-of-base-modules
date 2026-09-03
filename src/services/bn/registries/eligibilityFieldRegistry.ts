/**
 * Eligibility Field Registry — builder-facing view of the fields the engine
 * can actually evaluate.
 *
 * ELIG-03. This file used to carry its own hand-written list of field keys,
 * which drifted from the registries the engine resolves against. The rule
 * builder therefore offered keys (`contribution.recent_paid_weeks`,
 * `survivor.*`, `medical.disablement_percentage`) that no evaluation path can
 * read, and a rule authored with one was born unevaluable.
 *
 * The list is now derived, never hand-maintained: the authoritative field
 * registry (`eligibility/fieldRegistry.ts`, what `getFieldDef` reads) plus the
 * fact registry (`eligibility/eligibilityFactRegistry.ts`, what `getFact`
 * reads). Those two are exactly what `lookupField` consults at evaluation
 * time, so a key can be offered here if and only if the engine can evaluate
 * it. To add a field, add it to one of those registries — there is no second
 * list.
 *
 * Export names and shape are unchanged, so RuleBuilder, BlockInspector and
 * bnRegistryValidationService consume it exactly as before.
 */
import type { FieldDataType } from './operatorRegistry';
import {
  ELIGIBILITY_FIELD_REGISTRY,
  type EligibilityCategory as FieldCategory,
  type EligibilityValueType,
} from '../eligibility/fieldRegistry';
import {
  ELIGIBILITY_FACTS,
  CATEGORY_LABELS,
  type EligibilityCategory as FactCategory,
} from '../eligibility/eligibilityFactRegistry';
import type { EligibilityDataType } from '../eligibility/operators';

export interface EligibilityFieldDef {
  key: string;
  label: string;
  type: FieldDataType;
  /** Logical domain — used to group fields in the picker. */
  group: string;
  /** Resolver hint — adapter/table the runtime will read from. */
  source: string;
  /** Example value, used for the simulator. */
  sampleValue: string | number | boolean;
  description?: string;
}

const FIELD_GROUP: Record<FieldCategory, string> = {
  PERSON: 'Person',
  CONTRIBUTION: 'Contribution',
  EMPLOYER: 'Employer',
  EVIDENCE: 'Evidence',
  CLAIM: 'Claim',
};

const FIELD_TYPE: Record<EligibilityValueType, FieldDataType> = {
  number: 'number',
  string: 'string',
  boolean: 'boolean',
  date: 'date',
};

const FACT_TYPE: Record<EligibilityDataType, FieldDataType> = {
  number: 'number',
  date: 'date',
  string: 'string',
  bool: 'boolean',
  enum: 'string',
};

const SAMPLE_BY_TYPE: Record<FieldDataType, string | number | boolean> = {
  number: 0,
  string: '',
  boolean: true,
  date: '2026-01-01',
  list: '',
};

function build(): EligibilityFieldDef[] {
  const out: EligibilityFieldDef[] = [];
  const seen = new Set<string>();

  for (const f of ELIGIBILITY_FIELD_REGISTRY) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    const type = FIELD_TYPE[f.valueType] ?? 'string';
    out.push({
      key: f.key,
      label: f.label,
      type,
      group: f.key.startsWith('participant.') ? 'Participant' : FIELD_GROUP[f.category],
      source: f.dataSource,
      sampleValue: SAMPLE_BY_TYPE[type],
      description: f.helpText,
    });
  }

  for (const f of ELIGIBILITY_FACTS) {
    if (seen.has(f.fact_key)) continue;
    seen.add(f.fact_key);
    const type = FACT_TYPE[f.data_type] ?? 'string';
    out.push({
      key: f.fact_key,
      label: f.label,
      type,
      group: CATEGORY_LABELS[f.category as FactCategory] ?? 'Other',
      source: `${f.source_table}.${f.source_column}`,
      sampleValue: f.example_value ?? SAMPLE_BY_TYPE[type],
      description: f.description,
    });
  }

  return out;
}

export const ELIGIBILITY_FIELDS: readonly EligibilityFieldDef[] = build();

export type EligibilityFieldKey = string;

const BY_KEY = new Map(ELIGIBILITY_FIELDS.map((f) => [f.key, f]));

export function getEligibilityField(key: string): EligibilityFieldDef | undefined {
  return BY_KEY.get(key);
}

export function isValidEligibilityFieldKey(key: string): boolean {
  return BY_KEY.has(key);
}
