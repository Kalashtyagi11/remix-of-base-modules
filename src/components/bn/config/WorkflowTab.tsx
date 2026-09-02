import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBnWorkflowTemplates } from '@/hooks/bn/useBnConfig';
import { useBnProductVersion, useUpdateBnProductVersion } from '@/hooks/bn/useBnProduct';
import { useBnWorkbaskets } from '@/hooks/bn/useBnWorkbasket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Save, Workflow, AlertCircle, ChevronsUpDown, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
import { ReadOnlyVersionBanner } from './ReadOnlyVersionBanner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductWorkflowChannelGrid } from './ProductWorkflowChannelGrid';

interface Props { versionId: string | undefined; isReadOnly?: boolean; versionStatus?: string | null; }

interface WorkflowTemplateSummary { id: string; template_name: string; template_code: string; }

const STAGE_BASKETS: { key: string; label: string; help: string }[] = [
  { key: 'default_workbasket_id', label: 'Default Workbasket', help: 'Fallback when no stage-specific basket matches.' },
  { key: 'intake_workbasket_id', label: 'Intake Workbasket', help: 'Receives newly submitted claims (SUBMITTED / INTAKE_REVIEW).' },
  { key: 'eligibility_workbasket_id', label: 'Eligibility Workbasket', help: 'Handles ELIGIBILITY_CHECK and override review.' },
  { key: 'calculation_workbasket_id', label: 'Calculation Workbasket', help: 'Owns CALCULATION stage.' },
  { key: 'decision_workbasket_id', label: 'Decision Workbasket', help: 'Receives claims pending DECISION / approval.' },
  { key: 'payment_workbasket_id', label: 'Payment Workbasket', help: 'Receives AWARD_SETUP / PAYMENT_QUEUE work.' },
];

function useEscalationPolicies() {
  return useQuery({
    queryKey: ['bn', 'escalation-policies', 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('bn_escalation_policy')
        .select('id, policy_code, policy_name, is_active')
        .eq('is_active', true)
        .order('policy_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useTransitionRulesPreview(productCategory: string | null | undefined) {
  return useQuery({
    queryKey: ['bn', 'transition-rules-preview', productCategory ?? null],
    queryFn: async () => {
      let q = (supabase as any)
        .from('bn_claim_transition_rule')
        .select('from_status, to_status, action_code, action_label, allowed_roles, sort_order')
        .eq('is_active', true)
        .order('from_status')
        .order('sort_order');
      if (productCategory) q = q.or(`product_category.eq.${productCategory},product_category.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function WorkflowTab({ versionId, isReadOnly, versionStatus }: Props) {
  const { toast } = useToast();
  const { data: version } = useBnProductVersion(versionId);
  const { data: templates = [] } = useBnWorkflowTemplates();
  const { data: workbaskets = [] } = useBnWorkbaskets();
  const { data: escalationPolicies = [] } = useEscalationPolicies();
  const { data: transitions = [] } = useTransitionRulesPreview((version as any)?.bn_product?.product_category);
  const updateMutation = useUpdateBnProductVersion();
  const [legacyTemplatePickerOpen, setLegacyTemplatePickerOpen] = useState(false);

  const [form, setForm] = useState({
    workflow_template_id: '',
    requires_employer_verification: false,
    requires_medical_board_review: false,
    requires_means_test: false,
    default_workbasket_id: '',
    intake_workbasket_id: '',
    eligibility_workbasket_id: '',
    calculation_workbasket_id: '',
    decision_workbasket_id: '',
    payment_workbasket_id: '',
    escalation_policy_id: '',
  });

  useEffect(() => {
    if (version) {
      const v: any = version;
      setForm({
        workflow_template_id: v.workflow_template_id || '',
        requires_employer_verification: v.requires_employer_verification,
        requires_medical_board_review: v.requires_medical_board_review,
        requires_means_test: v.requires_means_test,
        default_workbasket_id: v.default_workbasket_id || '',
        intake_workbasket_id: v.intake_workbasket_id || '',
        eligibility_workbasket_id: v.eligibility_workbasket_id || '',
        calculation_workbasket_id: v.calculation_workbasket_id || '',
        decision_workbasket_id: v.decision_workbasket_id || '',
        payment_workbasket_id: v.payment_workbasket_id || '',
        escalation_policy_id: v.escalation_policy_id || '',
      });
    }
  }, [version]);

  const selectedTemplate = useMemo(
    () => templates.find((t: any) => t.id === form.workflow_template_id),
    [templates, form.workflow_template_id],
  );
  const templateSteps: any[] = useMemo(() => {
    const raw = (selectedTemplate as any)?.steps_config;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [selectedTemplate]);

  if (!versionId) return <Card><CardContent className="py-8 text-center text-muted-foreground">Select or create a product version first.</CardContent></Card>;

  const handleSave = async () => {
    try {
      const updates: any = {
        ...form,
        // Convert empty strings to null for FK columns
        workflow_template_id: form.workflow_template_id || null,
        default_workbasket_id: form.default_workbasket_id || null,
        intake_workbasket_id: form.intake_workbasket_id || null,
        eligibility_workbasket_id: form.eligibility_workbasket_id || null,
        calculation_workbasket_id: form.calculation_workbasket_id || null,
        decision_workbasket_id: form.decision_workbasket_id || null,
        payment_workbasket_id: form.payment_workbasket_id || null,
        escalation_policy_id: form.escalation_policy_id || null,
      };
      await updateMutation.mutateAsync({ id: versionId, updates });
      toast({ title: 'Saved', description: 'Workflow settings updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    }
  };

  const renderBasketSelect = (key: string, label: string, help: string) => (
    <div key={key} className="space-y-2">
      <Label>{label}</Label>
      <Select
        disabled={isReadOnly}
        value={(form as any)[key] || '__none__'}
        onValueChange={(v) => setForm((p) => ({ ...p, [key]: v === '__none__' ? '' : v }))}
      >
        <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not assigned</SelectItem>
          {workbaskets.map((b: any) => (
            <SelectItem key={b.id} value={b.id}>
              {b.basket_name} <span className="text-muted-foreground">({b.assigned_role})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Workflow Configuration</CardTitle>
            <CardDescription>Assign workflow templates, processing flags and routing for this version</CardDescription>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending || isReadOnly} className="gap-2">
            <Save className="h-4 w-4" /> Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <ReadOnlyVersionBanner show={!!isReadOnly} status={versionStatus} />

          <div className="space-y-2 max-w-md">
            <Label>Legacy Workflow Template (product-level fallback)</Label>
            <Popover open={legacyTemplatePickerOpen} onOpenChange={setLegacyTemplatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={isReadOnly}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {form.workflow_template_id
                      ? (() => {
                          const t = (templates as WorkflowTemplateSummary[]).find((x) => x.id === form.workflow_template_id);
                          return t ? `${t.template_name} (${t.template_code})` : 'Select workflow template';
                        })()
                      : <span className="text-muted-foreground">None</span>}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-2 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name or code…" />
                  <CommandList className="max-h-[320px]">
                    <CommandEmpty>No template matches.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__ none"
                        onSelect={() => { setForm(p => ({ ...p, workflow_template_id: '' })); setLegacyTemplatePickerOpen(false); }}
                      >
                        <Check className={`h-3.5 w-3.5 mr-2 ${!form.workflow_template_id ? 'opacity-100' : 'opacity-0'}`} />
                        None
                      </CommandItem>
                      {(templates as WorkflowTemplateSummary[]).map((t) => (
                        <CommandItem
                          key={t.id}
                          value={`${t.template_name} ${t.template_code}`}
                          onSelect={() => { setForm(p => ({ ...p, workflow_template_id: t.id })); setLegacyTemplatePickerOpen(false); }}
                        >
                          <Check className={`h-3.5 w-3.5 mr-2 ${form.workflow_template_id === t.id ? 'opacity-100' : 'opacity-0'}`} />
                          {t.template_name} ({t.template_code})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Used only when no per-channel mapping below matches. Prefer the Channel Workflow Mapping for new configurations.
            </p>
          </div>

          <ProductWorkflowChannelGrid productVersionId={versionId} isReadOnly={isReadOnly} />

          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="text-sm font-semibold">Processing Flags</h4>
            <div className="flex items-center justify-between"><Label>Requires Employer Verification</Label><Switch disabled={isReadOnly} checked={form.requires_employer_verification} onCheckedChange={v => setForm(p => ({ ...p, requires_employer_verification: v }))} /></div>
            <div className="flex items-center justify-between"><Label>Requires Medical Board Review</Label><Switch disabled={isReadOnly} checked={form.requires_medical_board_review} onCheckedChange={v => setForm(p => ({ ...p, requires_medical_board_review: v }))} /></div>
            <div className="flex items-center justify-between"><Label>Requires Means Test</Label><Switch disabled={isReadOnly} checked={form.requires_means_test} onCheckedChange={v => setForm(p => ({ ...p, requires_means_test: v }))} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage Routing — Workbaskets</CardTitle>
          <CardDescription>Route claims to the right team at each stage. Leave blank to fall through to the default workbasket.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STAGE_BASKETS.map(b => renderBasketSelect(b.key, b.label, b.help))}
          </div>
          {workbaskets.length === 0 && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> No workbaskets configured yet. Create them in BN Config → Workbaskets.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escalation Policy (Product-Level Fallback)</CardTitle>
          <CardDescription>
            Fallback SLA when neither the workflow step nor the assigned workbasket defines an escalation policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Product-level escalation is fallback only.</strong> Prefer workflow-step or
              workbasket SLA for stage-specific timelines. Runtime resolution order:
              <span className="font-mono"> step → workbasket → product → country/category → global</span>.
            </div>
          </div>
          <div className="max-w-md">
            <Select
              disabled={isReadOnly}
              value={form.escalation_policy_id || '__none__'}
              onValueChange={(v) => setForm((p) => ({ ...p, escalation_policy_id: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not assigned</SelectItem>
                {escalationPolicies.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.policy_name} ({e.policy_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="h-4 w-4" /> Workflow Steps Preview
          </CardTitle>
          <CardDescription>
            {selectedTemplate
              ? `Steps from template "${(selectedTemplate as any).template_name}". To edit, update the workflow template.`
              : 'Select a workflow template above to preview steps.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templateSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps defined on the selected template.</p>
          ) : (
            <ol className="space-y-2">
              {templateSteps.map((s: any, i: number) => (
                <li key={i} className="flex items-start gap-3 rounded-md border p-3">
                  <Badge variant="outline" className="mt-0.5">{i + 1}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.step_name || s.name || s.step_code || `Step ${i + 1}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {[s.step_type, s.assigned_role, s.sla ? `SLA: ${s.sla}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transition Matrix (DB)</CardTitle>
          <CardDescription>
            Active transitions from <code>bn_claim_transition_rule</code> that apply to this product category.
            These will become the runtime source of truth in Phase 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transition rules defined.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-3">From</th>
                    <th className="py-1 pr-3">Action</th>
                    <th className="py-1 pr-3">To</th>
                    <th className="py-1 pr-3">Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {transitions.map((t: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 pr-3 font-mono">{t.from_status}</td>
                      <td className="py-1 pr-3">{t.action_label} <span className="text-muted-foreground">({t.action_code})</span></td>
                      <td className="py-1 pr-3 font-mono">{t.to_status}</td>
                      <td className="py-1 pr-3">{(t.allowed_roles || []).join(', ') || <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RoleActionPreview transitions={transitions} />
      <EscalationRunnerCard />
    </div>
  );
}

// ─── Phase 6: Available actions by role preview ─────────────────────
function RoleActionPreview({ transitions }: { transitions: any[] }) {
  const roles = useMemo(() => {
    const set = new Set<string>();
    (transitions || []).forEach((t: any) => (t.allowed_roles || []).forEach((r: string) => set.add(r)));
    return Array.from(set).sort();
  }, [transitions]);
  const [role, setRole] = useState<string>('');
  useEffect(() => { if (!role && roles.length) setRole(roles[0]); }, [roles, role]);

  const filtered = useMemo(() => {
    if (!role) return [];
    return (transitions || []).filter((t: any) => !t.allowed_roles?.length || t.allowed_roles.includes(role));
  }, [transitions, role]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Available Actions by Role</CardTitle>
        <CardDescription>Preview which transitions a given role can perform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-64 h-8"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No actions available for this role.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {filtered.map((t: any, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">{t.from_status}</Badge>
                <span>→</span>
                <span>{t.action_label}</span>
                <Badge variant="outline" className="font-mono">{t.to_status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase 5: Manual escalation runner trigger ──────────────────────
function EscalationRunnerCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const { escalateOverdueExternalTasks } = await import('@/services/bn/bnEscalationRunnerService');
      const r = await escalateOverdueExternalTasks('CONFIG_RUN');
      setLast(`Scanned ${r.scanned} · Escalated ${r.escalated} · Skipped ${r.skipped}${r.errors.length ? ` · Errors ${r.errors.length}` : ''}`);
      toast({ title: 'Escalation run complete', description: `Escalated ${r.escalated} task(s)` });
    } catch (e: any) {
      toast({ title: 'Escalation failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> Escalation Runner
        </CardTitle>
        <CardDescription>
          Scan overdue work — external tasks, workbasket assignments, and override reviews — and fire the matching escalation policy using step → workbasket → product → global priority.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Button size="sm" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run Now'}
        </Button>
        {last && <span className="text-xs text-muted-foreground">{last}</span>}
      </CardContent>
    </Card>
  );
}

