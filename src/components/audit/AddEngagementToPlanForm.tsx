import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { useIADepartments, useIADepartmentFunctions, useIAActiveAuditors } from '@/hooks/useAuditData';
import { useResolvedEngagementRisk } from '@/hooks/useEngagementRisk';
import { StatusBadge } from '@/components/common';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { deriveFiscalQuarter } from '@/services/core/fiscalCalendarService';

const ENGAGEMENT_TYPES = ['Planned Audit', 'Ad-hoc Audit', 'Management Requested Audit', 'Special Investigation', 'Follow-up Audit'];

interface AddEngagementToPlanFormProps {
  planId: string;
  onSave: (payload: any) => void;
  isSaving?: boolean;
}

const RISK_SOURCE_LABELS: Record<string, string> = {
  risk_assessment_function: 'Function Risk Assessment',
  function_risk_rating: 'Function Risk Rating',
  department_risk_rating: 'Department Risk Rating',
  default: 'Default (no risk data available)',
};

export function AddEngagementToPlanForm({ planId, onSave, isSaving }: AddEngagementToPlanFormProps) {
  const { data: departments = [] } = useIADepartments();
  const { data: auditors = [] } = useIAActiveAuditors();
  // Quarter is derived from the enterprise fiscal calendar, never chosen by hand.
  const { data: fiscalYears = [] } = useFiscalYears();
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [form, setForm] = useState({
    engagement_name: '',
    department_id: '',
    function_id: '',
    engagement_type: 'Planned Audit',
    engagement_risk_rating: '',
    risk_override: false,
    risk_override_reason: '',
    derived_risk_rating: '',
    planned_start_date: '',
    planned_end_date: '',
    lead_auditor_id: '',
    supportive_auditor_ids: [] as string[],
    scope: '',
    quarter: '',
    estimated_hours: '',
    inclusion_rationale: '',
    coverage_category: '',
    board_priority_flag: false,
    is_adhoc: false,
  });

  const { data: deptFunctions = [] } = useIADepartmentFunctions(form.department_id || undefined);
  const { data: resolvedRisk, isLoading: riskLoading } = useResolvedEngagementRisk(
    form.department_id || undefined,
    form.function_id || undefined
  );

  // Auto-set risk from resolved risk when department/function changes
  useEffect(() => {
    if (resolvedRisk && !form.risk_override) {
      setForm(f => ({
        ...f,
        engagement_risk_rating: resolvedRisk.risk_rating,
        derived_risk_rating: resolvedRisk.risk_rating,
      }));
    }
  }, [resolvedRisk, form.risk_override]);

  // Filter auditors: only those with profile_id or user_id (mapped to system users)
  const mappedAuditors = (auditors || []).filter((a: any) => a.profile_id || a.user_id);
  const unmappedAuditors = (auditors || []).filter((a: any) => !a.profile_id && !a.user_id);

  const toggleAuditor = (id: string) => {
    setForm(f => ({
      ...f,
      supportive_auditor_ids: f.supportive_auditor_ids.includes(id)
        ? f.supportive_auditor_ids.filter(x => x !== id)
        : [...f.supportive_auditor_ids, id],
    }));
  };

  const generateCode = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `ENG-${dateStr}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  };

  const handleOverrideRequest = () => {
    setOverrideReason('');
    setShowOverrideDialog(true);
  };

  const confirmOverride = (selectedRisk: string) => {
    if (!overrideReason.trim()) return;
    setForm(f => ({
      ...f,
      engagement_risk_rating: selectedRisk,
      risk_override: true,
      risk_override_reason: overrideReason.trim(),
    }));
    setShowOverrideDialog(false);
  };

  const clearOverride = () => {
    if (resolvedRisk) {
      setForm(f => ({
        ...f,
        engagement_risk_rating: resolvedRisk.risk_rating,
        risk_override: false,
        risk_override_reason: '',
      }));
    }
  };

  const derivedQuarter = React.useMemo(() => {
    const fy = fiscalYears.find(
      f => form.planned_start_date >= f.start_date && form.planned_start_date <= f.end_date,
    );
    return deriveFiscalQuarter(fy, form.planned_start_date);
  }, [fiscalYears, form.planned_start_date]);

  const handleSubmit = () => {
    if (!form.engagement_name.trim()) return;
    onSave({
      engagement_name: form.engagement_name,
      engagement_code: generateCode(),
      annual_plan_id: planId,
      department_id: form.department_id || null,
      function_id: form.function_id || null,
      engagement_type: form.engagement_type,
      engagement_risk_rating: form.engagement_risk_rating || 'Medium',
      planned_start_date: form.planned_start_date || null,
      planned_end_date: form.planned_end_date || null,
      lead_auditor_id: form.lead_auditor_id || null,
      supportive_auditor_ids: form.supportive_auditor_ids,
      scope: form.scope,
      status: 'Planned',
      quarter: derivedQuarter || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      inclusion_rationale: form.inclusion_rationale || null,
      coverage_category: form.coverage_category || null,
      board_priority_flag: form.board_priority_flag,
      is_adhoc: form.is_adhoc,
      ...(form.risk_override ? {
        risk_override_reason: form.risk_override_reason,
        derived_risk_rating: form.derived_risk_rating,
      } : {}),
    });
  };

  const RISK_RATINGS = ['Critical', 'High', 'Medium', 'Low'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Audit Title *</Label>
          <Input value={form.engagement_name} onChange={e => setForm(f => ({ ...f, engagement_name: e.target.value }))} placeholder="e.g. IT Security Audit" />
        </div>
        <div>
          <Label>Engagement Type</Label>
          <IaReferenceSelect
            type="AUDIT_TYPE"
            value={form.engagement_type}
            onChange={v => setForm(f => ({ ...f, engagement_type: v }))}
          />
        </div>

      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Department</Label>
          <Select value={form.department_id} onValueChange={v => setForm(f => ({ ...f, department_id: v, function_id: '', risk_override: false, risk_override_reason: '' }))}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Function</Label>
          <Select value={form.function_id} onValueChange={v => setForm(f => ({ ...f, function_id: v, risk_override: false, risk_override_reason: '' }))} disabled={!form.department_id}>
            <SelectTrigger><SelectValue placeholder={form.department_id ? 'Select function' : 'Select department first'} /></SelectTrigger>
            <SelectContent>{deptFunctions.map((fn: any) => <SelectItem key={fn.id} value={fn.id}>{fn.function_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Auto-Risk Display */}
      <div className="rounded-md border p-3 bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Engagement Risk Rating</Label>
          </div>
          {form.risk_override ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearOverride}>
              Reset to Auto
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleOverrideRequest} disabled={!form.department_id}>
              Override
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {riskLoading ? (
            <span className="text-xs text-muted-foreground">Resolving risk...</span>
          ) : (
            <>
              <StatusBadge status={form.engagement_risk_rating || 'Medium'} />
              {resolvedRisk && (
                <span className="text-xs text-muted-foreground">
                  Source: {RISK_SOURCE_LABELS[resolvedRisk.source] || resolvedRisk.source}
                  {resolvedRisk.risk_score != null && ` (Score: ${resolvedRisk.risk_score})`}
                </span>
              )}
            </>
          )}
        </div>

        {form.risk_override && (
          <div className="flex items-start gap-2 mt-1 p-2 rounded bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-destructive">Manual Override</span>
              <span className="text-muted-foreground"> — Auto-derived was </span>
              <StatusBadge status={form.derived_risk_rating} />
              <p className="text-muted-foreground mt-0.5">Reason: {form.risk_override_reason}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Lead Auditor</Label>
          <Select value={form.lead_auditor_id} onValueChange={v => setForm(f => ({ ...f, lead_auditor_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select lead auditor" /></SelectTrigger>
            <SelectContent>
              {mappedAuditors.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name} — {a.role}</SelectItem>
              ))}
              {unmappedAuditors.length > 0 && (
                <div className="px-2 py-1.5 border-t">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {unmappedAuditors.length} auditor(s) hidden — not linked to system users
                  </p>
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Planned Start Date</Label>
          <Input type="date" value={form.planned_start_date} onChange={e => setForm(f => ({ ...f, planned_start_date: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Planned End Date</Label>
          <Input type="date" value={form.planned_end_date} onChange={e => setForm(f => ({ ...f, planned_end_date: e.target.value }))} />
        </div>
        <div />
      </div>

      <div>
        <Label>Supportive Auditor(s)</Label>
        <div className="border rounded-md p-2 max-h-[100px] overflow-y-auto space-y-1 bg-background">
          {mappedAuditors.filter((a: any) => a.id !== form.lead_auditor_id).map((a: any) => (
            <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
              <Checkbox checked={form.supportive_auditor_ids.includes(a.id)} onCheckedChange={() => toggleAuditor(a.id)} />
              {a.name} <span className="text-xs text-muted-foreground">({a.role})</span>
            </label>
          ))}
          {mappedAuditors.filter((a: any) => a.id !== form.lead_auditor_id).length === 0 && (
            <p className="text-xs text-muted-foreground p-1">No mapped auditors available</p>
          )}
        </div>
        {unmappedAuditors.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Info className="h-3 w-3" />
            {unmappedAuditors.length} auditor(s) excluded — link them to system users in Auditor Settings
          </p>
        )}
      </div>

      <div>
        <Label>Scope / Description</Label>
        <Textarea value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="Describe the scope of this engagement..." rows={3} />
      </div>

      {/* Portfolio Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Quarter</Label>
          <div className="h-10 flex items-center gap-2">
            {derivedQuarter ? (
              <Badge variant="secondary">{derivedQuarter}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Derived from the planned start date within the fiscal year
              </span>
            )}
          </div>
        </div>
        <div>
          <Label>Estimated Hours</Label>
          <Input type="number" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} placeholder="e.g. 120" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Coverage Category</Label>
          <IaReferenceSelect
            type="COVERAGE_CATEGORY"
            value={form.coverage_category}
            onChange={v => setForm(f => ({ ...f, coverage_category: v }))}
            placeholder="Select category"
            allowClear
          />

        </div>
        <div>
          <Label>Inclusion Rationale</Label>
          <Input value={form.inclusion_rationale} onChange={e => setForm(f => ({ ...f, inclusion_rationale: e.target.value }))} placeholder="Why this audit is included" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={form.board_priority_flag} onCheckedChange={(c) => setForm(f => ({ ...f, board_priority_flag: !!c }))} />
          Board Priority
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={form.is_adhoc} onCheckedChange={(c) => setForm(f => ({ ...f, is_adhoc: !!c }))} />
          Ad-hoc Audit
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isSaving || !form.engagement_name.trim()}>
          {isSaving ? 'Saving...' : 'Add Engagement'}
        </Button>
      </div>

      {/* Risk Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Override Risk Rating
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted/50 text-sm">
              <p className="text-muted-foreground">Auto-derived risk:</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={form.derived_risk_rating || 'Medium'} />
                <span className="text-xs text-muted-foreground">
                  from {resolvedRisk ? RISK_SOURCE_LABELS[resolvedRisk.source] : 'system'}
                </span>
              </div>
            </div>
            <div>
              <Label>New Risk Rating *</Label>
              <Select defaultValue="" onValueChange={v => setForm(f => ({ ...f, engagement_risk_rating: v }))}>
                <SelectTrigger><SelectValue placeholder="Select new risk level" /></SelectTrigger>
                <SelectContent>
                  {RISK_RATINGS.filter(r => r !== form.derived_risk_rating).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Override Reason *</Label>
              <Textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Explain why the auto-derived risk rating is being overridden..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>Cancel</Button>
            <Button
              onClick={() => confirmOverride(form.engagement_risk_rating)}
              disabled={!overrideReason.trim() || !form.engagement_risk_rating || form.engagement_risk_rating === form.derived_risk_rating}
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
