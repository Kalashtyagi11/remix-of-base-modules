/**
 * Enterprise Fiscal Calendar service (Stage 2A).
 *
 * Canonical master: public.core_fiscal_year.
 * Platform convention evidence: fiscal_year_start_month = 1 on
 * ssb_contribution_calendar_policy and bn_country (SKN) => the organisation's
 * fiscal year is the calendar year (01 Jan – 31 Dec) and the canonical label
 * style is FY<YYYY>.
 *
 * This is a PLATFORM capability. Internal Audit (and any other module) consumes
 * it read-only; only central configuration administrators may create or amend
 * fiscal years.
 */
import { supabase } from '@/integrations/supabase/client';

export type FiscalYearStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export interface FiscalYear {
  id: string;
  organization_id: string;
  code: string;
  display_name: string;
  start_date: string;
  end_date: string;
  status: FiscalYearStatus;
  is_active: boolean;
  planning_open: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface FiscalYearInput {
  code: string;
  display_name: string;
  start_date: string;
  end_date: string;
  status?: FiscalYearStatus;
  is_active?: boolean;
  planning_open?: boolean;
  notes?: string | null;
}

const TABLE = 'core_fiscal_year';

export async function listFiscalYears(): Promise<FiscalYear[]> {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as FiscalYear[];
}

/** Years that may back NEW planning work. */
export async function listPlanningEligibleFiscalYears(): Promise<FiscalYear[]> {
  const all = await listFiscalYears();
  return all.filter(isPlanningEligible);
}

export async function getDefaultOrganizationId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('core_organization' as any)
    .select('id')
    .eq('org_code', 'SKN-SSB')
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.id ?? null;
}

export async function createFiscalYear(input: FiscalYearInput, userCode?: string): Promise<FiscalYear> {
  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) throw new Error('CORE_ORGANISATION_NOT_CONFIGURED: no organisation is configured.');
  const { data, error } = await supabase
    .from(TABLE as any)
    .insert({
      organization_id: organizationId,
      code: input.code.trim(),
      display_name: input.display_name.trim() || input.code.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status ?? 'OPEN',
      is_active: input.is_active ?? true,
      planning_open: input.planning_open ?? true,
      notes: input.notes ?? null,
      created_by: userCode || 'system',
      updated_by: userCode || 'system',
    } as any)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as FiscalYear;
}

export async function updateFiscalYear(
  id: string,
  patch: Partial<FiscalYearInput>,
  userCode?: string,
): Promise<FiscalYear> {
  const { data, error } = await supabase
    .from(TABLE as any)
    .update({ ...patch, updated_by: userCode || 'system' } as any)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as FiscalYear;
}

/** Fiscal years are never physically deleted — they are deactivated. */
export async function setFiscalYearActive(id: string, isActive: boolean, userCode?: string) {
  return updateFiscalYear(id, { is_active: isActive }, userCode);
}

export async function setFiscalYearStatus(id: string, status: FiscalYearStatus, userCode?: string) {
  return updateFiscalYear(
    id,
    { status, planning_open: status === 'CLOSED' ? false : undefined },
    userCode,
  );
}

// ── Pure derivation helpers (mirror of the server-side SQL functions) ──

export function isPlanningEligible(fy: Pick<FiscalYear, 'is_active' | 'planning_open' | 'status'>): boolean {
  return Boolean(fy.is_active && fy.planning_open && fy.status !== 'CLOSED');
}

export function isDateInFiscalYear(fy: Pick<FiscalYear, 'start_date' | 'end_date'>, date?: string | null): boolean {
  if (!date) return false;
  return date >= fy.start_date && date <= fy.end_date;
}

/**
 * Canonical quarter derivation: quarter of the planned start date measured from
 * the fiscal year start (four equal three-month periods). Returns null when the
 * date falls outside the fiscal year.
 */
export function deriveFiscalQuarter(
  fy: Pick<FiscalYear, 'start_date' | 'end_date'> | null | undefined,
  date?: string | null,
): string | null {
  if (!fy || !date) return null;
  if (!isDateInFiscalYear(fy, date)) return null;
  const [sy, sm] = fy.start_date.split('-').map(Number);
  const [dy, dm] = date.split('-').map(Number);
  const months = (dy - sy) * 12 + (dm - sm);
  return `Q${Math.min(4, Math.max(1, Math.floor(months / 3) + 1))}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function deriveMonthName(date?: string | null): string | null {
  if (!date) return null;
  const m = Number(date.split('-')[1]);
  return MONTHS[m - 1] ?? null;
}

export function fiscalYearLabel(fy?: FiscalYear | null): string {
  if (!fy) return '—';
  return fy.display_name || fy.code;
}
