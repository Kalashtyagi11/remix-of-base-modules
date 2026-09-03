/**
 * Eligibility Field Registry — builder-facing view of the ONE authoritative
 * registry.
 *
 * ELIG-03. This file used to carry its own hand-written list of field keys,
 * which drifted from `services/bn/eligibility/fieldRegistry.ts` — the registry
 * the engine actually resolves against. The rule builder therefore offered
 * keys (`contribution.paid_weeks`, `survivor.*`, `medical.*`) that no
 * evaluation path could ever read, and a rule authored with one was born
 * unevaluable.
 *
 * The list is now derived from the authoritative registry, so a key can only
 * be offered here if the engine can evaluate it. Export names and shape are
 * unchanged, so RuleBuilder, BlockInspector and bnRegistryValidationService
 * consume it exactly as before. A field the builders need must be added to
 * `eligibility/fieldRegistry.ts` — there is no second list to add it to.
 */
import type { FieldDataType } from './operatorRegistry';
import {
  ELIGIBILITY_FIELD_REGISTRY,
  type EligibilityCategory,
  type EligibilityValueType,
} from '../eligibility/fieldRegistry';

export type EligibilityFieldGroup =
  | 'Person'
  | 'Contribution'
  | 'Employer'
  | 'Evidence'
  | 'Claim'
  | 'Participant';

export interface EligibilityFieldDef {
  key: string;
  label: string;
  type: FieldDataType;
  /** Logical domain — used to group fields in the picker. */
  group: EligibilityFieldGroup;
  /** Resolver hint — adapter/table the runtime will read from. */
  source: string;
  /** Example value, used for the simulator. */
  sampleValue: string | number | boolean;
  description?: string;
}

const GROUP_BY_CATEGORY: Record<EligibilityCategory, EligibilityFieldGroup> = {
  PERSON: 'Person',
  CONTRIBUTION: 'Contribution',
  EMPLOYER: 'Employer',
  EVIDENCE: 'Evidence',
  CLAIM: 'Claim',
};

const TYPE_BY_VALUE_TYPE: Record<EligibilityValueType, FieldDataType> = {
  number: 'number',
  string: 'string',
  boolean: 'boolean',
  date: 'date',
};

const SAMPLE_BY_TYPE: Record<FieldDataType, string | number | boolean> = {
  number: 0,
  string: '',
  boolean: true,
  date: '2026-01-01',
  list: '',
};

export const ELIGIBILITY_FIELDS: readonly EligibilityFieldDef[] = ELIGIBILITY_FIELD_REGISTRY.map((f) => {
  const type = TYPE_BY_VALUE_TYPE[f.valueType] ?? 'string';
  return {
    key: f.key,
    label: f.label,
    type,
    group: f.key.startsWith('participant.') ? 'Participant' : GROUP_BY_CATEGORY[f.category],
    source: f.dataSource,
    sampleValue: SAMPLE_BY_TYPE[type],
    description: f.helpText,
  } satisfies EligibilityFieldDef;
});

export type EligibilityFieldKey = string;

const BY_KEY = new Map(ELIGIBILITY_FIELDS.map((f) => [f.key, f]));

export function getEligibilityField(key: string): EligibilityFieldDef | undefined {
  return BY_KEY.get(key);
}

export function isValidEligibilityFieldKey(key: string): boolean {
  return BY_KEY.has(key);
}
