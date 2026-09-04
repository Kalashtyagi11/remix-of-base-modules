/**
 * INTERNAL AUDIT — Audit Plan Status & Management Report workspace.
 *
 * Live status and immutable point-in-time snapshots for HIA, Executive
 * Management, the Audit / Risk Committee and Department Management.
 * Every figure comes from the single server-side status engine.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Download, FileText, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import {
  MANAGEMENT_AUDIENCES,
  MANAGEMENT_PERIODS,
  MANAGEMENT_REPORT_MODES,
  fetchLiveManagementStatus,
  generateManagementStatusReport,
  listManagementStatusReports,
  type ManagementAudience,
  type ManagementPeriodCode,
  type ManagementReportMode,
  type ManagementStatusPayload,
  type ManagementStatusSnapshot,
} from '@/services/audit/managementStatusReportService';

import {
  downloadManagementStatusPdf,
  managementStatusPdfBlob,
} from '../ManagementStatusReportPDFExport';
import { distributeManagementStatusReport } from '@/services/audit/managementStatusDistributionService';

interface Props {
  /** When provided the plan is fixed (plan workspace tab). */
  planId?: string;
}

const HEALTH_CLASS: Record<string, string> = {
  GREEN: 'bg-success/15 text-success border-success/30',
  AMBER: 'bg-warning/15 text-warning border-warning/30',
  RED: 'bg-destructive/15 text-destructive border-destructive/30',
};

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function fmt(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

export function ManagementStatusPanel({ planId: fixedPlanId }: Props) {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string | undefined>(fixedPlanId);
  const [audience, setAudience] = useState<ManagementAudience>('HIA');
  const [departmentId, setDepartmentId] = useState<string>('all');
  const [asAt, setAsAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reportingPeriod, setReportingPeriod] = useState<string>('');
  const [periodCode, setPeriodCode] = useState<ManagementPeriodCode>('CURRENT');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [reportMode, setReportMode] = useState<ManagementReportMode>('Detailed Management Report');

  const [compareId, setCompareId] = useState<string>('none');
  const [viewing, setViewing] = useState<ManagementStatusSnapshot | null>(null);
  const [distributing, setDistributing] = useState<ManagementStatusSnapshot | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ['ia-msr-plans'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ia_annual_plans')
        .select('id, title, fiscal_year, status')
        .order('created_at', { ascending: false });
      return (data ?? []) as Array<{ id: string; title: string; fiscal_year: string; status: string }>;
    },
    enabled: !fixedPlanId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['ia-msr-departments'],
    queryFn: async () => {
      const { data } = await supabase.from('ia_departments').select('id, name').order('name');
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const effectivePlanId = fixedPlanId ?? planId;
  const effectiveDept = audience === 'Department Management' && departmentId !== 'all' ? departmentId : null;

  const live = useQuery({
    queryKey: ['ia-msr-live', effectivePlanId, audience, effectiveDept, asAt],
    queryFn: () =>
      fetchLiveManagementStatus({
        planId: effectivePlanId!,
        audience,
        departmentId: effectiveDept,
        asAt: new Date(`${asAt}T23:59:59Z`).toISOString(),
      }),
    enabled: !!effectivePlanId,
  });

  const snapshots = useQuery({
    queryKey: ['ia-msr-snapshots', effectivePlanId],
    queryFn: () => listManagementStatusReports(effectivePlanId!),
    enabled: !!effectivePlanId,
  });

  const payload: ManagementStatusPayload | undefined =
    live.data && live.data.ok !== false ? live.data : undefined;
  const notAuthorised = live.data && live.data.ok === false;

  const shown = viewing?.snapshot ?? payload;
  const shownMeta = viewing
    ? {
        reportNumber: viewing.report_number,
        reportingPeriod: viewing.reporting_period,
        comparison: viewing.comparison,
      }
    : { reportNumber: null, reportingPeriod: reportingPeriod || null, comparison: null };

  const k = shown?.kpis ?? {};
  const attention = shown?.management_attention ?? [];

  const engagementRows = useMemo(() => shown?.engagements ?? [], [shown]);

  async function handleGenerate() {
    if (!effectivePlanId) return;
    setBusy(true);
    const res = await generateManagementStatusReport({
      planId: effectivePlanId,
      audience,
      reportingPeriod: reportingPeriod || null,
      asAt: new Date(`${asAt}T23:59:59Z`).toISOString(),
      departmentId: effectiveDept,
      compareReportId: compareId === 'none' ? null : compareId,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(
        res.code === 'not_authorised'
          ? 'You are not entitled to generate this management status report.'
          : 'The management status report could not be generated.',
      );
      return;
    }
    toast.success(`Management status report ${res.reportNumber ?? ''} generated.`);
    qc.invalidateQueries({ queryKey: ['ia-msr-snapshots', effectivePlanId] });
  }

  function handlePdf() {
    if (!shown) return;
    downloadManagementStatusPdf(shown, shownMeta);
  }

  async function handleDistribute() {
    if (!distributing) return;
    if (!recipientEmail.trim()) {
      toast.error('Enter a recipient email address.');
      return;
    }
    setBusy(true);
    const blob = managementStatusPdfBlob(distributing.snapshot, {
      reportNumber: distributing.report_number,
      reportingPeriod: distributing.reporting_period,
      comparison: distributing.comparison,
    });
    const res = await distributeManagementStatusReport({
      reportId: distributing.id,
      reportNumber: distributing.report_number,
      planTitle: distributing.snapshot?.plan?.title,
      audience: distributing.audience,
      statusAsAt: distributing.status_as_at,
      recipients: [{ name: recipientName || recipientEmail, email: recipientEmail }],
      blob,
    });
    setBusy(false);
    if (res.acceptedCount > 0) {
      toast.success('Management status report submitted to the communication hub.');
      setDistributing(null);
      setRecipientEmail('');
      setRecipientName('');
    } else {
      toast.error(`Distribution blocked: ${res.results[0]?.blockers?.join(', ') || 'unavailable'}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Reporting context ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Reporting Context
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          {!fixedPlanId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Annual Plan</Label>
              <Select value={planId} onValueChange={(v) => { setPlanId(v); setViewing(null); }}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.fiscal_year} — {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as ManagementAudience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANAGEMENT_AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Department scope</Label>
            <Select
              value={departmentId}
              onValueChange={setDepartmentId}
              disabled={audience !== 'Department Management'}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status as at</Label>
            <Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reporting period</Label>
            <Input
              placeholder="e.g. Q2 FY2030"
              value={reportingPeriod}
              onChange={(e) => setReportingPeriod(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {!effectivePlanId && (
        <p className="text-sm text-muted-foreground">Select an annual plan to view its management status.</p>
      )}

      {effectivePlanId && live.isLoading && <Skeleton className="h-64 w-full" />}

      {notAuthorised && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          You are not entitled to view the management status of this plan.
        </CardContent></Card>
      )}

      {shown && (
        <>
          {/* ── Header / actions ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={HEALTH_CLASS[shown.health?.rating ?? 'GREEN']}>
                Plan health: {shown.health?.rating ?? 'GREEN'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {viewing
                  ? `Sealed snapshot ${viewing.report_number} · as at ${fmt(viewing.status_as_at)}`
                  : `Live status · as at ${fmt(shown.as_at)}`}
              </span>
              {viewing && (
                <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>Back to live</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => live.refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handlePdf}>
                <Download className="h-4 w-4 mr-2" />PDF
              </Button>
              {!viewing && (
                <Button size="sm" disabled={busy} onClick={handleGenerate}>
                  <FileText className="h-4 w-4 mr-2" />Generate status report
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{shown.health?.basis}</p>

          {/* ── KPI dashboard ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Kpi label="Approved engagements" value={k.approved_engagements ?? 0} />
            <Kpi label="Completed" value={`${k.closed ?? 0} + ${k.closed_actions_pending ?? 0} pending`} />
            <Kpi label="In progress" value={k.in_progress ?? 0} />
            <Kpi label="Not started" value={k.planned_not_started ?? 0} />
            <Kpi label="Delayed / at risk" value={k.delayed_at_risk ?? 0} />
            <Kpi label="Carried forward" value={k.carried_forward ?? 0} />
            <Kpi label="Plan completion" value={`${k.plan_completion_pct ?? 0}%`} />
            <Kpi label="Schedule adherence" value={`${k.schedule_adherence_pct ?? 0}%`} />
            <Kpi label="Open Critical/High findings" value={shown.findings?.open_critical_high ?? 0} />
            <Kpi label="Overdue responses" value={shown.findings?.overdue_responses ?? 0} />
            <Kpi label="Open actions" value={shown.actions?.open ?? 0} />
            <Kpi label="Overdue actions" value={shown.actions?.overdue ?? 0} />
          </div>

          <Tabs defaultValue="engagements" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="engagements">Engagements ({engagementRows.length})</TabsTrigger>
              <TabsTrigger value="findings">Findings & Actions</TabsTrigger>
              <TabsTrigger value="prior">Prior Issues & Capacity</TabsTrigger>
              <TabsTrigger value="changes">Plan Changes</TabsTrigger>
              <TabsTrigger value="attention">Attention ({attention.length})</TabsTrigger>
              <TabsTrigger value="snapshots">Snapshots ({snapshots.data?.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="engagements">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Audit</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Planned</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-40">Progress</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead className="text-right">Var (d)</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead className="text-right">Findings</TableHead>
                      <TableHead className="text-right">Open actions</TableHead>
                      <TableHead>Next milestone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {engagementRows.map((e) => (
                      <TableRow key={e.engagement_id}>
                        <TableCell className="font-mono text-xs">{e.engagement_code ?? '—'}</TableCell>
                        <TableCell className="text-sm">{e.engagement_name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{e.department_name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{e.risk_rating ?? '—'}</TableCell>
                        <TableCell className="text-xs">{fmt(e.planned_start)} → {fmt(e.planned_end)}</TableCell>
                        <TableCell className="text-xs">{fmt(e.actual_start)} → {fmt(e.actual_end)}</TableCell>
                        <TableCell className="text-xs">{e.lifecycle_status ?? '—'}</TableCell>
                        <TableCell>
                          <div className="space-y-1" title={String(e.progress_components?.explanation ?? '')}>
                            <Progress value={e.progress_pct ?? 0} className="h-2" />
                            <span className="text-[11px] text-muted-foreground">{e.progress_pct ?? 0}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{e.schedule_health}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{e.variance_days ?? 0}</TableCell>
                        <TableCell className="text-xs">{e.lead_auditor ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.findings_total ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.open_actions ?? 0}</TableCell>
                        <TableCell className="text-xs">{e.next_milestone ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {engagementRows.length === 0 && (
                      <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">
                        No approved engagements in scope at this date.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="findings">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Findings & Risk Exposure</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {Object.entries(shown.findings?.by_severity ?? {}).map(([sev, n]) => (
                      <div key={sev} className="flex justify-between"><span>{sev}</span><span className="tabular-nums">{String(n)}</span></div>
                    ))}
                    <div className="flex justify-between border-t pt-1.5"><span>Open Critical / High</span><span className="tabular-nums">{shown.findings?.open_critical_high ?? 0}</span></div>
                    <div className="flex justify-between"><span>Disputed</span><span className="tabular-nums">{shown.findings?.disputed ?? 0}</span></div>
                    <div className="flex justify-between"><span>Repeat / prior-year</span><span className="tabular-nums">{shown.findings?.repeat_prior_year ?? 0}</span></div>
                    <div className="flex justify-between"><span>Overdue management responses</span><span className="tabular-nums">{shown.findings?.overdue_responses ?? 0}</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Corrective Actions</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    <div className="flex justify-between"><span>Open</span><span className="tabular-nums">{shown.actions?.open ?? 0}</span></div>
                    <div className="flex justify-between"><span>In progress</span><span className="tabular-nums">{shown.actions?.in_progress ?? 0}</span></div>
                    <div className="flex justify-between"><span>Awaiting verification</span><span className="tabular-nums">{shown.actions?.awaiting_verification ?? 0}</span></div>
                    <div className="flex justify-between"><span>Verified / closed</span><span className="tabular-nums">{shown.actions?.verified ?? 0}</span></div>
                    <div className="flex justify-between"><span>Overdue</span><span className="tabular-nums">{shown.actions?.overdue ?? 0}</span></div>
                    <div className="flex justify-between"><span>Due within 30 days</span><span className="tabular-nums">{shown.actions?.due_soon ?? 0}</span></div>
                    <div className="flex justify-between border-t pt-1.5"><span>Overdue ageing 0–30 / 31–90 / 90+</span>
                      <span className="tabular-nums">
                        {shown.actions?.ageing?.lte_30 ?? 0} / {shown.actions?.ageing?.d31_90 ?? 0} / {shown.actions?.ageing?.gt_90 ?? 0}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="prior">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Prior Issues & Follow-Up</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    <div className="flex justify-between"><span>Prior open actions</span><span className="tabular-nums">{shown.prior_history?.prior_open_actions ?? 0}</span></div>
                    <div className="flex justify-between"><span>Prior Critical / High findings</span><span className="tabular-nums">{shown.prior_history?.prior_critical_high_findings ?? 0}</span></div>
                    <div className="flex justify-between"><span>Follow-ups due</span><span className="tabular-nums">{shown.prior_history?.follow_ups_due ?? 0}</span></div>
                    <div className="flex justify-between"><span>Follow-ups overdue</span><span className="tabular-nums">{shown.prior_history?.follow_ups_overdue ?? 0}</span></div>
                    <div className="flex justify-between"><span>Partially implemented</span><span className="tabular-nums">{shown.prior_history?.partially_implemented ?? 0}</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Resource & Capacity</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    <div className="flex justify-between"><span>Allocated hours</span><span className="tabular-nums">{shown.capacity?.allocated_hours ?? 0}</span></div>
                    <div className="flex justify-between"><span>Available hours</span><span className="tabular-nums">{shown.capacity?.available_hours ?? 0}</span></div>
                    <div className="flex justify-between"><span>Utilisation</span><span className="tabular-nums">{shown.capacity?.utilisation_pct ?? 0}%</span></div>
                    <div className="flex justify-between"><span>Auditors engaged</span><span className="tabular-nums">{shown.capacity?.auditors_engaged ?? 0}</span></div>
                    <div className="flex justify-between"><span>Approved leave days in period</span><span className="tabular-nums">{shown.capacity?.leave_days ?? 0}</span></div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="changes">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Type</TableHead><TableHead>Change</TableHead>
                    <TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(shown.plan_changes?.amendments ?? []).map((a: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{a.amendment_type ?? '—'}</TableCell>
                        <TableCell className="text-sm">{`${a.field ?? ''} ${a.old_value ?? ''} → ${a.new_value ?? ''}`.trim()}</TableCell>
                        <TableCell className="text-sm">{a.reason ?? '—'}</TableCell>
                        <TableCell className="text-sm">{a.status ?? '—'}</TableCell>
                        <TableCell className="text-xs">{fmt(a.date)}</TableCell>
                      </TableRow>
                    ))}
                    {(shown.plan_changes?.amendments ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        No plan amendments recorded — original commitments stand.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent></Card>
              {shownMeta.comparison && (
                <Card className="mt-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">
                    Changes since {shownMeta.comparison.previous_report_number}
                  </CardTitle></CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                    {Object.entries(shownMeta.comparison)
                      .filter(([key]) => !key.startsWith('previous_'))
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between border-b py-1">
                          <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="tabular-nums">{String(val)}</span>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="attention">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Severity</TableHead><TableHead>Category</TableHead>
                    <TableHead>Matter</TableHead><TableHead>Source</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {attention.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge variant="outline">{a.severity}</Badge></TableCell>
                        <TableCell className="text-sm">{a.category}</TableCell>
                        <TableCell className="text-sm">{a.title}</TableCell>
                        <TableCell className="text-xs font-mono">{a.link}</TableCell>
                      </TableRow>
                    ))}
                    {attention.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                        No matters currently require management decision.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="snapshots">
              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Compare against</CardTitle></CardHeader>
                <CardContent>
                  <Select value={compareId} onValueChange={setCompareId}>
                    <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No comparison</SelectItem>
                      {(snapshots.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.report_number} — {fmt(s.status_as_at)} ({s.audience})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    The next generated report records movement since the selected sealed snapshot.
                  </p>
                </CardContent>
              </Card>
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Report</TableHead><TableHead>As at</TableHead><TableHead>Period</TableHead>
                    <TableHead>Audience</TableHead><TableHead>Plan version</TableHead>
                    <TableHead>Sealed PDF</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(snapshots.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.report_number}</TableCell>
                        <TableCell className="text-xs">{fmt(s.status_as_at)}</TableCell>
                        <TableCell className="text-xs">{s.reporting_period ?? '—'}</TableCell>
                        <TableCell className="text-xs">{s.audience}</TableCell>
                        <TableCell className="text-xs">v{s.plan_version_number ?? 1}</TableCell>
                        <TableCell className="text-xs">{s.artifact_id ? 'Sealed' : 'Not sealed'}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => setViewing(s)}>View</Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => downloadManagementStatusPdf(s.snapshot, {
                              reportNumber: s.report_number,
                              reportingPeriod: s.reporting_period,
                              comparison: s.comparison,
                            })}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDistributing(s)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(snapshots.data ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No management status reports generated for this plan yet.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={!!distributing} onOpenChange={(o) => !o && setDistributing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Distribute {distributing?.report_number}</DialogTitle>
            <DialogDescription>
              The sealed PDF is attached through the communication hub. Internal Audit never sends directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient name</Label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient email</Label>
              <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributing(null)}>Cancel</Button>
            <Button disabled={busy} onClick={handleDistribute}>
              <Send className="h-4 w-4 mr-2" />Distribute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManagementStatusPanel;
