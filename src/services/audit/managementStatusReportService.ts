/**
 * INTERNAL AUDIT — Audit Plan Status & Management Reporting.
 *
 * Thin client over the canonical server-side calculation. There is exactly one
 * status engine (`ia_management_status_live` / `ia_engagement_status_model`);
 * the browser never recomputes KPIs, progress, schedule health or plan health,
 * and never allocates the authoritative management report number.
 *
 * NO-HARDCODING RULE: audiences, reporting periods, report definitions,
 * sections, metrics and methodology values are governed configuration read at
 * runtime. Nothing organisation-specific is embedded in this module.
 */
import { supabase } from '@/integrations/supabase/client';

/** Audience codes are governed reference data (`MANAGEMENT_REPORT_AUDIENCE`). */
export type ManagementAudience = string;

/** Reporting period selectors are governed reference data; boundaries come from the fiscal calendar. */
export type ManagementPeriodCode = string;

/** Report modes are governed report definitions (`ia_report_definition`). */
export type ManagementReportMode = string;

export interface ReferenceOption {
  code: string;
  name: string;
  sortOrder: number;
}

export interface ReportSectionConfig {
  id: string;
  sectionKey: string;
  heading: string;
  sortOrder: number;
  isVisible: boolean;
  startOnNewPage: boolean;
  displayMode: string;
  isAppendix: boolean;
  audiences: string[];
}

export interface ReportDefinitionConfig {
  id: string;
  reportCode: string;
  reportName: string;
  audienceCode: string | null;
  permittedScope: string | null;
  templateType: string | null;
  documentClassification: string | null;
  requiresApproval: boolean;
  distributionPolicy: string | null;
  comparisonBehaviour: string | null;
  metrics: string[];
  versionNumber: number;
  displayOrder: number;
  sections: ReportSectionConfig[];
}

export interface ReportMetricConfig {
  metricCode: string;
  label: string;
  formatter: string | null;
  sourcePath: string | null;
  audiences: string[];
  displayOrder: number;
}

export interface ReportMethodologyConfig {
  id: string;
  methodologyCode: string;
  versionNumber: number;
  name: string | null;
  status: string;
  effectiveFrom: string | null;
  config: Record<string, any>;
}

export interface ManagementReportingConfiguration {
  audiences: ReferenceOption[];
  periods: ReferenceOption[];
  definitions: ReportDefinitionConfig[];
  metrics: ReportMetricConfig[];
  methodologies: ReportMethodologyConfig[];
}

async function fetchReferenceOptions(type: string): Promise<ReferenceOption[]> {
  const { data } = await supabase
    .from('ia_reference_value')
    .select('code, name, display_order, is_active')
    .eq('reference_type', type)
    .eq('is_active', true)
    .order('display_order');
  return ((data ?? []) as Array<{ code: string; name: string; display_order: number | null }>).map((r) => ({
    code: r.code,
    name: r.name ?? r.code,
    sortOrder: r.display_order ?? 0,
  }));

}

/** Resolve the complete governed reporting configuration (no hard-coded lists). */
export async function fetchManagementReportingConfiguration(): Promise<ManagementReportingConfiguration> {
  const [audiences, periods, defsRes, sectionsRes, metricsRes, methodRes] = await Promise.all([
    fetchReferenceOptions('MANAGEMENT_REPORT_AUDIENCE'),
    fetchReferenceOptions('MANAGEMENT_REPORT_PERIOD'),
    supabase.from('ia_report_definition').select('*').eq('is_active', true).order('display_order'),
    supabase.from('ia_report_definition_section').select('*').order('sort_order'),
    supabase.from('ia_report_metric').select('*').eq('is_enabled', true).order('display_order'),
    supabase.from('ia_report_methodology').select('*').eq('status', 'Active'),
  ]);

  const sections = (sectionsRes.data ?? []) as any[];
  const definitions: ReportDefinitionConfig[] = ((defsRes.data ?? []) as any[]).map((d) => ({
    id: d.id,
    reportCode: d.report_code,
    reportName: d.report_name,
    audienceCode: d.audience_code ?? null,
    permittedScope: d.permitted_scope ?? null,
    templateType: d.template_type ?? null,
    documentClassification: d.document_classification ?? null,
    requiresApproval: !!d.requires_approval,
    distributionPolicy: d.distribution_policy ?? null,
    comparisonBehaviour: d.comparison_behaviour ?? null,
    metrics: (d.metrics ?? []) as string[],
    versionNumber: d.version_number ?? 1,
    displayOrder: d.display_order ?? 0,
    sections: sections
      .filter((s) => s.definition_id === d.id)
      .map((s) => ({
        id: s.id,
        sectionKey: s.section_key,
        heading: s.heading,
        sortOrder: s.sort_order ?? 0,
        isVisible: s.is_visible !== false,
        startOnNewPage: !!s.start_on_new_page,
        displayMode: s.display_mode ?? 'detail',
        isAppendix: !!s.is_appendix,
        audiences: (s.audiences ?? []) as string[],
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return {
    audiences,
    periods,
    definitions,
    metrics: ((metricsRes.data ?? []) as any[]).map((m) => ({
      metricCode: m.metric_code,
      label: m.label,
      formatter: m.formatter ?? null,
      sourcePath: m.source_path ?? null,
      audiences: (m.audiences ?? []) as string[],
      displayOrder: m.display_order ?? 0,
    })),
    methodologies: ((methodRes.data ?? []) as any[]).map((m) => ({
      id: m.id,
      methodologyCode: m.methodology_code,
      versionNumber: m.version_number,
      name: m.name ?? null,
      status: m.status,
      effectiveFrom: m.effective_from ?? null,
      config: (m.config ?? {}) as Record<string, any>,
    })),
  };
}

/** Resolve the value a configured metric points at inside the canonical payload. */
export function resolveMetricValue(payload: any, path: string | null): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), payload);
}

export function formatMetricValue(value: unknown, formatter: string | null): string {
  if (value === null || value === undefined) return '—';
  if (formatter === 'percent') return `${value}%`;
  if (formatter === 'hours') return `${value} h`;
  return String(value);
}



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

export interface ManagementPeriod {
  ok: boolean;
  code: ManagementPeriodCode;
  label: string;
  start: string;
  end: string;
  fiscal_year: string | null;
  fiscal_start: string | null;
  fiscal_end: string | null;
}

export interface CompletedAuditSummary {
  engagement_id: string;
  engagement_code: string | null;
  title: string | null;
  department: string | null;
  audit_type: string | null;
  risk_rating: string | null;
  objectives: string | null;
  scope: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  completed_on: string | null;
  lead_auditor: string | null;
  disposition: string | null;
  report_id: string | null;
  report_number: string | null;
  report_issued_at: string | null;
  audit_opinion: string | null;
  conclusion: string | null;
  executive_summary: string | null;
  report_objective: string | null;
  report_scope: string | null;
  findings_by_severity: Record<string, number>;
  significant_findings: Array<{
    id: string;
    title: string | null;
    severity: string | null;
    status: string | null;
    recommendation: string | null;
  }>;
  findings_total: number;
  responses_received: number;
  actions_total: number;
  actions_outstanding: number;
  next_target_date: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
}

export interface ManagementStatusPayload {
  ok: boolean;
  code?: string;
  version?: number;
  report_mode?: string;
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
  health: {
    rating: 'GREEN' | 'AMBER' | 'RED';
    score: number;
    basis: string;
    methodology_version?: number | string;
    rules_triggered?: Array<{
      rule: string;
      label: string;
      severity: string;
      metric: string;
      observed: number;
      threshold: number;
      score: number;
    }>;
    bands?: Record<string, number>;
  };
  /** Configuration versions used to calculate this payload. */
  provenance?: Record<string, any>;

  /** V2 — reporting period activity and completed-audit reporting. */
  period?: ManagementPeriod;
  period_movement?: Record<string, number>;
  completed_audits?: CompletedAuditSummary[];
  themes?: Array<{
    theme_code: string;
    theme_name: string;
    finding_count: number;
    audit_count: number;
    finding_ids: string[];
  }>;
  coverage?: Record<string, number>;
  forecast?: Record<string, any>;
  temporal_fidelity?: {
    as_at_is_historical: boolean;
    reconstructed: string[];
    current_state_only: string[];
    limitation: string;
  };
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
  /** Sealed configuration provenance — how this report was calculated. */
  config_provenance?: Record<string, any> | null;

}

/** Live plan status + period activity — reads current state, never stored. */
export async function fetchLiveManagementStatus(input: {
  planId: string;
  asAt?: string | null;
  audience?: ManagementAudience;
  departmentId?: string | null;
  periodCode?: ManagementPeriodCode;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<ManagementStatusPayload> {
  const { data, error } = await supabase.rpc('ia_management_status_live_v2', {
    p_plan_id: input.planId,
    p_as_at: input.asAt || new Date().toISOString(),
    p_audience: input.audience ?? 'HIA',
    p_department_id: input.departmentId ?? null,
    p_period_code: input.periodCode ?? 'CURRENT',
    p_period_start: input.periodStart ?? null,
    p_period_end: input.periodEnd ?? null,
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
  periodCode?: ManagementPeriodCode;
  periodStart?: string | null;
  periodEnd?: string | null;
  reportMode?: ManagementReportMode;
}): Promise<{ ok: boolean; code?: string; reportId?: string; reportNumber?: string | null }> {
  const { data, error } = await supabase.rpc('ia_generate_management_status_report', {
    p_plan_id: input.planId,
    p_audience: input.audience,
    p_reporting_period: input.reportingPeriod ?? null,
    p_as_at: input.asAt || new Date().toISOString(),
    p_department_id: input.departmentId ?? null,
    p_compare_report_id: input.compareReportId ?? null,
    p_period_code: input.periodCode ?? 'CURRENT',
    p_period_start: input.periodStart ?? null,
    p_period_end: input.periodEnd ?? null,
    p_report_mode: input.reportMode ?? 'Detailed Management Report',
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
