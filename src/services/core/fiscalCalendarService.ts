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

/**
 * Governed mutation path (Stage 2A-S / DEF-E2E-013).
 *
 * All Fiscal Master writes go through SECURITY DEFINER server commands which
 * derive the actor (auth.uid()), derive the organisation server-side and check
 * the central platform master-data administration capability
 * (public.core_master_data_actor_can). Direct table DML is revoked for anon and
 * authenticated, so the browser cannot bypass this path.
 *
 * Single-organisation deployment: the server resolves the configured
 * organisation; the browser never supplies organization_id, created_by or
 * updated_by.
 */
export async function createFiscalYear(input: FiscalYearInput): Promise<FiscalYear> {
  const { data, error } = await supabase.rpc('core_fiscal_year_create' as any, {
    p_code: input.code.trim(),
    p_display_name: input.display_name?.trim() || input.code.trim(),
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_status: input.status ?? 'OPEN',
    p_is_active: input.is_active ?? true,
    p_planning_open: input.planning_open ?? true,
    p_notes: input.notes ?? null,
  } as any);
  if (error) throw error;
  return data as unknown as FiscalYear;
}

export async function updateFiscalYear(
  id: string,
  patch: Partial<FiscalYearInput>,
): Promise<FiscalYear> {
  const { data, error } = await supabase.rpc('core_fiscal_year_update' as any, {
    p_id: id,
    p_code: patch.code ?? null,
    p_display_name: patch.display_name ?? null,
    p_start_date: patch.start_date ?? null,
    p_end_date: patch.end_date ?? null,
    p_status: patch.status ?? null,
    p_is_active: patch.is_active ?? null,
    p_planning_open: patch.planning_open ?? null,
    p_notes: patch.notes ?? null,
  } as any);
  if (error) throw error;
  return data as unknown as FiscalYear;
}

/** Fiscal years are never physically deleted — they are deactivated. */
export async function setFiscalYearActive(id: string, isActive: boolean): Promise<FiscalYear> {
  const { data, error } = await supabase.rpc('core_fiscal_year_set_active' as any, {
    p_id: id,
    p_is_active: isActive,
  } as any);
  if (error) throw error;
  return data as unknown as FiscalYear;
}

export async function setFiscalYearStatus(id: string, status: FiscalYearStatus): Promise<FiscalYear> {
  const { data, error } = await supabase.rpc('core_fiscal_year_set_status' as any, {
    p_id: id,
    p_status: status,
  } as any);
  if (error) throw error;
  return data as unknown as FiscalYear;
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
