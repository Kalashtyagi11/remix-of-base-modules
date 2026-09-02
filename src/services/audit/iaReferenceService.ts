/**
 * Internal Audit governed reference master (Stage 2B).
 *
 * Canonical source: public.ia_reference_value, typed by public.ia_reference_type.
 * Concepts converged in Stage 2B:
 *   AUDIT_TYPE        — DEF-E2E-007
 *   COVERAGE_CATEGORY — DEF-E2E-008
 *   FOLLOW_UP_TYPE
 *
 * Reads are RLS-scoped to IA users. ALL mutations go through governed
 * SECURITY DEFINER commands that derive the actor server-side, enforce
 * audit_configuration.configure authority, validate semantics and write an
 * immutable audit event. The browser never supplies identity, and UI dropdowns
 * are never authoritative — the server re-validates every reference.
 *
 * Risk vocabulary (Critical/High/Medium/Low) is NOT owned here; it stays with
 * ia_risk_classification_thresholds and is rejected as a coverage category.
 */
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type IaReferenceTypeCode = 'AUDIT_TYPE' | 'COVERAGE_CATEGORY' | 'FOLLOW_UP_TYPE';

export interface IaReferenceValue {
  id: string;
  reference_type: IaReferenceTypeCode;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}

export interface IaReferenceValueInput {
  reference_type: IaReferenceTypeCode;
  code: string;
  name: string;
  description?: string | null;
  display_order?: number;
}

/** All values of a type, active first, then display order. */
export async function listReferenceValues(
  type: IaReferenceTypeCode,
  opts?: { includeInactive?: boolean },
): Promise<IaReferenceValue[]> {
  let q = db
    .from('ia_reference_value')
    .select('*')
    .eq('reference_type', type);
  if (!opts?.includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q
    .order('is_active', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as IaReferenceValue[];
}

export async function listAllReferenceValues(): Promise<IaReferenceValue[]> {
  const { data, error } = await db
    .from('ia_reference_value')
    .select('*')
    .order('reference_type', { ascending: true })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data || []) as IaReferenceValue[];
}

export async function createReferenceValue(input: IaReferenceValueInput): Promise<string> {
  const { data, error } = await db.rpc('ia_reference_value_create', {
    _reference_type: input.reference_type,
    _code: input.code,
    _name: input.name,
    _description: input.description ?? null,
    _display_order: input.display_order ?? 0,
  });
  if (error) throw error;
  return data as string;
}

export async function updateReferenceValue(
  id: string,
  patch: { name?: string; description?: string | null; display_order?: number },
): Promise<void> {
  const { error } = await db.rpc('ia_reference_value_update', {
    _id: id,
    _name: patch.name ?? null,
    _description: patch.description ?? null,
    _display_order: patch.display_order ?? null,
  });
  if (error) throw error;
}

/** Deactivation is the only retirement path — reference values are never deleted. */
export async function setReferenceValueActive(
  id: string,
  isActive: boolean,
  reason?: string,
): Promise<void> {
  const { error } = await db.rpc('ia_reference_value_set_active', {
    _id: id,
    _is_active: isActive,
    _reason: reason ?? null,
  });
  if (error) throw error;
}

export interface IaReferenceHealthCheck {
  check_code: string;
  severity: string;
  affected_count: number;
  detail: string;
}

export async function getReferenceConfigurationHealth(): Promise<IaReferenceHealthCheck[]> {
  const { data, error } = await db.rpc('ia_reference_configuration_health');
  if (error) throw error;
  return (data || []) as IaReferenceHealthCheck[];
}

export interface IaReferenceMigrationMapRow {
  id: string;
  reference_type: string;
  legacy_value: string | null;
  classification: string;
  canonical_code: string | null;
  rows_affected: number;
  rationale: string | null;
}

export async function listReferenceMigrationMap(): Promise<IaReferenceMigrationMapRow[]> {
  const { data, error } = await db
    .from('ia_reference_migration_map')
    .select('*')
    .order('reference_type')
    .order('rows_affected', { ascending: false });
  if (error) throw error;
  return (data || []) as IaReferenceMigrationMapRow[];
}
