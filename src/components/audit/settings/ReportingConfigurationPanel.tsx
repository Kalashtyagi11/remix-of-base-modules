/**
 * INTERNAL AUDIT — Reporting Configuration (no-hardcoding gate).
 *
 * Maintains the governed configuration that drives Audit Plan Status &
 * Management Reporting: progress / schedule / plan-health methodologies,
 * report sections and the metric registry.
 *
 * Every write goes through a governed SECURITY DEFINER RPC which enforces
 * authorisation (`ia_can_manage_reporting_config`), validation, versioning and
 * the configuration audit trail. The browser never writes these tables.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fetchManagementReportingConfiguration } from '@/services/audit/managementStatusReportService';

interface MethodologyRow {
  id: string;
  methodology_code: string;
  version_number: number;
  name: string | null;
  status: string;
  effective_from: string | null;
  config: Record<string, any>;
  notes: string | null;
}

async function fetchMethodologies(): Promise<MethodologyRow[]> {
  const { data, error } = await supabase
    .from('ia_report_methodology')
    .select('id, methodology_code, version_number, name, status, effective_from, config, notes')
    .order('methodology_code')
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MethodologyRow[];
}

async function fetchConfigAudit() {
  const { data } = await supabase
    .from('ia_report_config_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as any[];
}

export function ReportingConfigurationPanel() {
  const qc = useQueryClient();
  const [draftCode, setDraftCode] = useState('PROGRESS');
  const [draftName, setDraftName] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftConfig, setDraftConfig] = useState('{\n}\n');

  const { data: config } = useQuery({
    queryKey: ['ia-msr-config'],
    queryFn: fetchManagementReportingConfiguration,
  });
  const { data: methodologies = [] } = useQuery({ queryKey: ['ia-report-methodologies'], queryFn: fetchMethodologies });
  const { data: auditRows = [] } = useQuery({ queryKey: ['ia-report-config-audit'], queryFn: fetchConfigAudit });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ia-msr-config'] });
    qc.invalidateQueries({ queryKey: ['ia-report-methodologies'] });
    qc.invalidateQueries({ queryKey: ['ia-report-config-audit'] });
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(draftConfig);
      } catch {
        throw new Error('Configuration must be valid JSON.');
      }
      const { error } = await supabase.rpc('ia_report_save_methodology_draft' as any, {
        p_code: draftCode,
        p_config: parsed,
        p_name: draftName || null,
        p_notes: draftNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Draft methodology version saved for review.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not save the draft.'),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('ia_report_activate_methodology' as any, { p_id: id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Methodology version activated. Existing sealed reports are unchanged.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Activation was refused.'),
  });

  const setMetric = useMutation({
    mutationFn: async (v: { code: string; enabled?: boolean; order?: number; label?: string }) => {
      const { error } = await supabase.rpc('ia_report_configure_metric' as any, {
        p_metric_code: v.code,
        p_is_enabled: v.enabled ?? null,
        p_display_order: v.order ?? null,
        p_label: v.label ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Metric registry updated.'); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? 'Change refused.'),
  });

  const setSection = useMutation({
    mutationFn: async (v: { id: string; visible?: boolean; order?: number; heading?: string; newPage?: boolean }) => {
      const { error } = await supabase.rpc('ia_report_configure_section' as any, {
        p_section_id: v.id,
        p_is_visible: v.visible ?? null,
        p_sort_order: v.order ?? null,
        p_heading: v.heading ?? null,
        p_start_on_new_page: v.newPage ?? null,
        p_display_mode: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Report structure updated.'); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? 'Change refused.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Management Reporting Configuration</CardTitle>
        <CardDescription>
          Progress, schedule and plan-health rules, report structure and the metric registry are governed
          configuration. Changes are versioned and audited, and never alter previously sealed reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="methodology">
          <TabsList>
            <TabsTrigger value="methodology">Methodologies</TabsTrigger>
            <TabsTrigger value="sections">Report structure</TabsTrigger>
            <TabsTrigger value="metrics">Metric registry</TabsTrigger>
            <TabsTrigger value="audit">Change history</TabsTrigger>
          </TabsList>

          <TabsContent value="methodology" className="space-y-6 pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Methodology</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {methodologies.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name ?? m.methodology_code}</TableCell>
                    <TableCell>v{m.version_number}</TableCell>
                    <TableCell>
                      <Badge variant={m.status === 'Active' ? 'default' : 'secondary'}>{m.status}</Badge>
                    </TableCell>
                    <TableCell>{m.effective_from ?? '—'}</TableCell>
                    <TableCell className="max-w-[420px]">
                      <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">
                        {JSON.stringify(m.config, null, 1)}
                      </pre>
                    </TableCell>
                    <TableCell className="text-right">
                      {m.status !== 'Active' && (
                        <Button size="sm" variant="outline" onClick={() => activate.mutate(m.id)} disabled={activate.isPending}>
                          Activate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="grid gap-3 md:grid-cols-2 border-t pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Methodology code</Label>
                <Input value={draftCode} onChange={(e) => setDraftCode(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Version name</Label>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Progress weights 2027" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Configuration (JSON)</Label>
                <Textarea rows={8} value={draftConfig} onChange={(e) => setDraftConfig(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Reason for change</Label>
                <Input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
              </div>
              <div>
                <Button onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
                  Save draft version
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sections" className="pt-4">
            {(config?.definitions ?? []).map((d) => (
              <div key={d.id} className="mb-6">
                <p className="text-sm font-medium mb-2">{d.reportName} <span className="text-muted-foreground">({d.reportCode})</span></p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>New page</TableHead>
                      <TableHead>Included</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.sections.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.heading}</TableCell>
                        <TableCell>
                          <Input
                            className="w-20 h-8"
                            defaultValue={s.sortOrder}
                            type="number"
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== s.sortOrder) setSection.mutate({ id: s.id, order: v });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch checked={s.startOnNewPage} onCheckedChange={(v) => setSection.mutate({ id: s.id, newPage: v })} />
                        </TableCell>
                        <TableCell>
                          <Switch checked={s.isVisible} onCheckedChange={(v) => setSection.mutate({ id: s.id, visible: v })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="metrics" className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(config?.metrics ?? []).map((m) => (
                  <TableRow key={m.metricCode}>
                    <TableCell>
                      <Input
                        className="h-8"
                        defaultValue={m.label}
                        onBlur={(e) => {
                          if (e.target.value !== m.label) setMetric.mutate({ code: m.metricCode, label: e.target.value });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.sourcePath ?? '—'}</TableCell>
                    <TableCell className="text-xs">{m.formatter ?? 'text'}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-20 h-8"
                        defaultValue={m.displayOrder}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== m.displayOrder) setMetric.mutate({ code: m.metricCode, order: v });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch checked onCheckedChange={(v) => setMetric.mutate({ code: m.metricCode, enabled: v })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="audit" className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.entity_type} {r.entity_code ?? ''}</TableCell>
                    <TableCell className="text-xs">{r.action}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[420px] truncate">
                      {JSON.stringify(r.new_value ?? r.detail ?? {})}
                    </TableCell>
                  </TableRow>
                ))}
                {auditRows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No configuration changes recorded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default ReportingConfigurationPanel;
