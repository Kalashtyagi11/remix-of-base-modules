/**
 * INTERNAL AUDIT — Audit Plan Status & Management Reporting.
 *
 * Thin client over the canonical server-side calculation. There is exactly one
 * status engine (`ia_management_status_live` / `ia_engagement_status_model`);
 * the browser never recomputes KPIs, progress, schedule health or plan health,
 * and never allocates the authoritative IA-MSR-SKN-… number.
 */
import { supabase } from '@/integrations/supabase/client';

export type ManagementAudience =
  | 'HIA'
  | 'Executive Management'
  | 'Audit / Risk Committee'
  | 'Department Management';

export const MANAGEMENT_AUDIENCES: ManagementAudience[] = [
  'HIA',
  'Executive Management',
  'Audit / Risk Committee',
  'Department Management',
];

export interface EngagementStatusRow {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string | null;
  department_id: string | null;
  department_name: string | null;
  function_id: string | null;
  risk_rating: string | null;
  quarter: string | null;
  audit_type: string | null;
  coverage_category: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  lifecycle_status: string | null;
  workflow_stage: string | null;
  progress_pct: number;
  progress_components: {
    lifecycle_stage?: string;
    stage_weight?: number;
    evidence_bonus?: number;
    explanation?: string;
    [k: string]: unknown;
  };
  schedule_health: string;
  variance_days: number | null;
  forecast_end: string | null;
  lead_auditor: string | null;
  findings_total: number;
  findings_critical_high: number;
  open_actions: number;
  overdue_actions: number;
  audit_opinion: string | null;
  report_number: string | null;
  next_milestone: string | null;
  key_blocker: string | null;
}

export interface ManagementStatusPayload {
  ok: boolean;
  code?: string;
  plan: { id: string; title: string; fiscal_year: string | null; status: string; version: number };
  as_at: string;
  audience: string;
  department_id: string | null;
  kpis: Record<string, number>;
  engagements: EngagementStatusRow[];
  findings: Record<string, any>;
  actions: Record<string, any>;
  prior_history: Record<string, number>;
  capacity: Record<string, any>;
  plan_changes: Record<string, any>;
  management_attention: Array<{
    severity: string;
    category: string;
    title: string;
    link: string;
    source_type: string;
    source_id: string;
  }>;
  health: { rating: 'GREEN' | 'AMBER' | 'RED'; score: number; basis: string };
}

export interface ManagementStatusSnapshot {
  id: string;
  report_number: string | null;
  plan_id: string;
  plan_version_number: number | null;
  fiscal_year: string | null;
  reporting_period: string | null;
  status_as_at: string;
  audience: string;
  department_id: string | null;
  status: string;
  snapshot: ManagementStatusPayload;
  comparison_report_id: string | null;
  comparison: Record<string, any> | null;
  artifact_id: string | null;
  generated_by: string | null;
  generated_at: string;
}

/** Live plan status — reads current state, never stored. */
export async function fetchLiveManagementStatus(input: {
  planId: string;
  asAt?: string | null;
  audience?: ManagementAudience;
  departmentId?: string | null;
}): Promise<ManagementStatusPayload> {
  const { data, error } = await supabase.rpc('ia_management_status_live', {
    p_plan_id: input.planId,
    p_as_at: input.asAt || new Date().toISOString(),
    p_audience: input.audience ?? 'HIA',
    p_department_id: input.departmentId ?? null,
  } as never);

  if (error) throw new Error('management_status_unavailable');
  return data as unknown as ManagementStatusPayload;
}

/** Generate an immutable point-in-time snapshot with an authoritative number. */
export async function generateManagementStatusReport(input: {
  planId: string;
  audience: ManagementAudience;
  reportingPeriod?: string | null;
  asAt?: string | null;
  departmentId?: string | null;
  compareReportId?: string | null;
}): Promise<{ ok: boolean; code?: string; reportId?: string; reportNumber?: string | null }> {
  const { data, error } = await supabase.rpc('ia_generate_management_status_report', {
    p_plan_id: input.planId,
    p_audience: input.audience,
    p_reporting_period: input.reportingPeriod ?? null,
    p_as_at: input.asAt || new Date().toISOString(),
    p_department_id: input.departmentId ?? null,
    p_compare_report_id: input.compareReportId ?? null,
  } as never);

  if (error) return { ok: false, code: 'generation_failed' };
  const row = (data ?? {}) as { ok?: boolean; code?: string; report_id?: string; report_number?: string };
  return { ok: !!row.ok, code: row.code, reportId: row.report_id, reportNumber: row.report_number ?? null };
}

/** Sealed snapshots for a plan, newest first. */
export async function listManagementStatusReports(planId: string): Promise<ManagementStatusSnapshot[]> {
  const { data, error } = await supabase
    .from('ia_management_status_report')
    .select('*')
    .eq('plan_id', planId)
    .order('status_as_at', { ascending: false });
  if (error) return [];
  return (data as unknown as ManagementStatusSnapshot[]) ?? [];
}

export async function getManagementStatusReport(id: string): Promise<ManagementStatusSnapshot | null> {
  const { data } = await supabase
    .from('ia_management_status_report')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as ManagementStatusSnapshot) ?? null;
}

/** Record the sealed PDF artifact against a snapshot. */
export async function attachManagementStatusArtifact(reportId: string, artifactId: string) {
  await supabase.rpc('ia_attach_management_status_artifact', {
    p_report_id: reportId,
    p_artifact_id: artifactId,
  } as never);
}

export function healthTone(rating: string | undefined): 'success' | 'warning' | 'destructive' {
  if (rating === 'RED') return 'destructive';
  if (rating === 'AMBER') return 'warning';
  return 'success';
}
