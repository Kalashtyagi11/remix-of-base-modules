import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ShieldCheck, Info, Save, Calendar, Lock, AlertCircle } from 'lucide-react';
import {
  type IaValidationIssue,
  type IaTabDescriptor,
  errorCountsByTab,
  fieldErrorMap,
  fieldAnchorId,
  focusFirstInvalidField,
  getFirstInvalidTab,
  issuesForTab,
  summariseIssues,
} from '@/lib/audit/tabValidation';
import { useIADepartments, useIADepartmentFunctions, useIAActiveAuditors } from '@/hooks/useAuditData';
import { useResolvedEngagementRisk } from '@/hooks/useEngagementRisk';
import { StatusBadge } from '@/components/common';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { MultiSelectChips } from './engagement/MultiSelectChips';
import { AuditeeContactSelector } from './engagement/AuditeeContactSelector';
import { ScheduleIntelligence } from './engagement/ScheduleIntelligence';
import { useFiscalYears } from '@/hooks/useFiscalYears';
import { deriveFiscalQuarter } from '@/services/core/fiscalCalendarService';
import { IaReferenceSelect } from '@/components/audit/reference/IaReferenceSelect';

// Stage 2B (DEF-E2E-007/008): audit type and coverage category come from the
// governed IA reference master. Risk ratings remain owned by the canonical risk
// architecture (ia_risk_classification_thresholds) — no duplicate master here.
const RISK_RATINGS = ['Critical', 'High', 'Medium', 'Low'];
// Stage 2E (DEF-E2E-012): engagement workflow status is governed server state.
// It is displayed read-only here and changed only through governed commands.


const INCLUSION_REASONS = [
  'High Risk Area',
  'Regulatory / Compliance Requirement',
  'Management Request',
  'Previous Audit Findings',
  'High Transaction Volume',
  'Process Criticality',
  'System / Process Change',
  'Fraud Risk / Sensitive Area',
  'Follow-up Audit',
  'Board / Audit Committee Request',
  'Rotational Coverage',
  'Thematic Review',
  'Other',
];

const DELIVERABLE_OPTIONS = [
  'Audit Report',
  'Detailed Findings Report',
  'Management Action Plan',
  'Process Improvement Recommendations',
  'Control Gap Assessment',
  'Compliance Assessment',
  'Root Cause Analysis',
  'Data Analytics Report',
  'Risk Assessment Update',
  'Follow-up Tracker',
  'Executive Summary Memo',
  'Board / Committee Summary',
  'Other',
];

const RISK_SOURCE_LABELS: Record<string, string> = {
  risk_assessment_function: 'Function Risk Assessment',
  function_risk_rating: 'Function Risk Rating',
  department_risk_rating: 'Department Risk Rating',
  default: 'Default (no risk data available)',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Quarter is a DERIVED value, not master data. It is measured from the start of
 * the fiscal year that contains the planned start date (core_fiscal_year), so a
 * January-start and an April-start fiscal year never share Q1 semantics.
 * Falls back to the calendar quarter only when no fiscal year covers the date.
 */
function getQuarterFromDate(
  dateStr: string,
  fiscalYears: Array<{ start_date: string; end_date: string }> = [],
): string {
  if (!dateStr) return '';
  const fy = fiscalYears.find(f => dateStr >= f.start_date && dateStr <= f.end_date);
  const derived = deriveFiscalQuarter(fy, dateStr);
  if (derived) return derived;
  const month = new Date(dateStr).getMonth(); // 0-indexed
  if (month < 3) return 'Q1';
  if (month < 6) return 'Q2';
  if (month < 9) return 'Q3';
  return 'Q4';
}

function getMonthFromDate(dateStr: string): string {
  if (!dateStr) return '';
  return MONTHS[new Date(dateStr).getMonth()] || '';
}


/** Calculate working days between two dates (excludes weekends) */
function calcWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (s > e) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Add working days to a date, returns ISO date string */
function addWorkingDays(start: string, days: number): string {
  if (!start || days <= 0) return '';
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

interface EditEngagementDialogProps {
  open: boolean;
  onClose: () => void;
  engagement: any | null;
  planId: string;
  planFiscalYear?: string;
  onSave: (payload: any) => void;
  isSaving?: boolean;
  isApprovedPlan?: boolean;
  allEngagements?: any[];
}

export function EditEngagementDialog({
  open, onClose, engagement, planId, planFiscalYear, onSave, isSaving, isApprovedPlan, allEngagements = []
}: EditEngagementDialogProps) {
  const { toast } = useToast();
  const { data: departments = [] } = useIADepartments();
  const { data: auditors = [] } = useIAActiveAuditors();
  // Enterprise fiscal calendar drives quarter derivation.
  const { data: fiscalYears = [] } = useFiscalYears();
  const isEditMode = !!engagement?.id;

  const [dirty, setDirty] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [quarterOverride, setQuarterOverride] = useState(false);
  const [monthOverride, setMonthOverride] = useState(false);

  const [form, setForm] = useState({
    engagement_name: '',
    department_id: '',
    function_id: '',
    engagement_type: '', // Stage 2B: governed IA reference master supplies values; no hardcoded default
    engagement_risk_rating: 'Medium',
    risk_override: false,
    risk_override_reason: '',
    derived_risk_rating: '',
    planned_start_date: '',
    planned_end_date: '',
    lead_auditor_id: '',
    supportive_auditor_ids: [] as string[],
    reviewer_id: '',
    scope: '',
    objectives: '',
    quarter: '',
    month: '',
    estimated_hours: '',
    estimated_days: '',
    inclusion_rationale: '',
    coverage_category: '',
    board_priority_flag: false,
    is_adhoc: false,
    status: 'Planned',
    expected_deliverable: '',
    dependencies: '',
    scheduling_notes: '',
    auditee_contact: '',
    auditable_area_summary: '',
    sequence_no: '',
    // New structured fields
    inclusion_reason_codes: [] as string[],
    inclusion_reason_notes: '',
    expected_deliverable_codes: [] as string[],
    expected_deliverable_notes: '',
    primary_auditee_contact_id: '',
    secondary_auditee_contact_ids: [] as string[],
  });

  useEffect(() => {
    if (engagement && open) {
      const reasonCodes = Array.isArray(engagement.inclusion_reason_codes) ? engagement.inclusion_reason_codes : [];
      const deliverableCodes = Array.isArray(engagement.expected_deliverable_codes) ? engagement.expected_deliverable_codes : [];
      const secondaryIds = Array.isArray(engagement.secondary_auditee_contact_ids) ? engagement.secondary_auditee_contact_ids : [];

      setForm({
        engagement_name: engagement.engagement_name || '',
        department_id: engagement.department_id || '',
        function_id: engagement.function_id || '',
        engagement_type: engagement.engagement_type || '',
        engagement_risk_rating: engagement.engagement_risk_rating || 'Medium',
        risk_override: false,
        risk_override_reason: '',
        derived_risk_rating: '',
        planned_start_date: engagement.planned_start_date || '',
        planned_end_date: engagement.planned_end_date || '',
        lead_auditor_id: engagement.lead_auditor_id || '',
        supportive_auditor_ids: Array.isArray(engagement.supportive_auditor_ids) ? engagement.supportive_auditor_ids : [],
        reviewer_id: engagement.reviewer_id || '',
        scope: engagement.scope || '',
        objectives: engagement.objectives || '',
        quarter: engagement.quarter || '',
        month: engagement.month || '',
        estimated_hours: engagement.estimated_hours?.toString() || '',
        estimated_days: engagement.estimated_days?.toString() || '',
        inclusion_rationale: engagement.inclusion_rationale || '',
        coverage_category: engagement.coverage_category || '',
        board_priority_flag: engagement.board_priority_flag || false,
        is_adhoc: engagement.is_adhoc || false,
        status: engagement.status || 'Planned',
        expected_deliverable: engagement.expected_deliverable || '',
        dependencies: engagement.dependencies || '',
        scheduling_notes: engagement.scheduling_notes || '',
        auditee_contact: engagement.auditee_contact || '',
        auditable_area_summary: engagement.auditable_area_summary || '',
        sequence_no: engagement.sequence_no?.toString() || '',
        // Structured fields with legacy fallback
        inclusion_reason_codes: reasonCodes,
        inclusion_reason_notes: engagement.inclusion_reason_notes || (reasonCodes.length === 0 ? (engagement.inclusion_rationale || '') : ''),
        expected_deliverable_codes: deliverableCodes,
        expected_deliverable_notes: engagement.expected_deliverable_notes || (deliverableCodes.length === 0 ? (engagement.expected_deliverable || '') : ''),
        primary_auditee_contact_id: engagement.primary_auditee_contact_id || '',
        secondary_auditee_contact_ids: secondaryIds,
      });
      setDirty(false);
      setQuarterOverride(false);
      setMonthOverride(false);
    } else if (!engagement && open) {
      setForm({
        engagement_name: '', department_id: '', function_id: '', engagement_type: '',
        engagement_risk_rating: 'Medium', risk_override: false, risk_override_reason: '', derived_risk_rating: '',
        planned_start_date: '', planned_end_date: '', lead_auditor_id: '', supportive_auditor_ids: [],
        reviewer_id: '', scope: '', objectives: '', quarter: '', month: '', estimated_hours: '', estimated_days: '',
        inclusion_rationale: '', coverage_category: '', board_priority_flag: false, is_adhoc: false, status: 'Planned',
        expected_deliverable: '', dependencies: '', scheduling_notes: '', auditee_contact: '',
        auditable_area_summary: '', sequence_no: '',
        inclusion_reason_codes: [], inclusion_reason_notes: '',
        expected_deliverable_codes: [], expected_deliverable_notes: '',
        primary_auditee_contact_id: '', secondary_auditee_contact_ids: [],
      });
      setDirty(false);
      setQuarterOverride(false);
      setMonthOverride(false);
    }
  }, [engagement, open]);

  const { data: deptFunctions = [] } = useIADepartmentFunctions(form.department_id || undefined);
  const { data: resolvedRisk, isLoading: riskLoading } = useResolvedEngagementRisk(
    form.department_id || undefined,
    form.function_id || undefined
  );

  useEffect(() => {
    if (resolvedRisk && !form.risk_override && !isEditMode) {
      updateField('engagement_risk_rating', resolvedRisk.risk_rating);
      updateField('derived_risk_rating', resolvedRisk.risk_rating);
    }
  }, [resolvedRisk, form.risk_override]);

  // Auto-derive quarter and month from start date
  useEffect(() => {
    if (form.planned_start_date && !quarterOverride) {
      const q = getQuarterFromDate(form.planned_start_date, fiscalYears);
      if (q && q !== form.quarter) {
        setForm(f => ({ ...f, quarter: q }));
      }
    }
    if (form.planned_start_date && !monthOverride) {
      const m = getMonthFromDate(form.planned_start_date);
      if (m && m !== form.month) {
        setForm(f => ({ ...f, month: m }));
      }
    }
  }, [form.planned_start_date, quarterOverride, monthOverride, fiscalYears]);

  // Auto-calculate estimated days from date range
  useEffect(() => {
    if (form.planned_start_date && form.planned_end_date) {
      const days = calcWorkingDays(form.planned_start_date, form.planned_end_date);
      if (days > 0 && days.toString() !== form.estimated_days) {
        setForm(f => ({ ...f, estimated_days: days.toString(), estimated_hours: (days * 8).toString() }));
      }
    }
  }, [form.planned_start_date, form.planned_end_date]);

  const mappedAuditors = (auditors || []).filter((a: any) => a.id && (a.profile_id || a.user_id));
  const unmappedAuditors = (auditors || []).filter((a: any) => !a.profile_id && !a.user_id);

  const updateField = (field: string, value: any) => {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  };

  const toggleAuditor = (id: string) => {
    setForm(f => ({
      ...f,
      supportive_auditor_ids: f.supportive_auditor_ids.includes(id)
        ? f.supportive_auditor_ids.filter(x => x !== id)
        : [...f.supportive_auditor_ids, id],
    }));
    setDirty(true);
  };

  // Smart date handlers
  const handleStartDateChange = (val: string) => {
    updateField('planned_start_date', val);
    // If we have estimated days but no end date, suggest end date
    if (val && form.estimated_days && !form.planned_end_date) {
      const suggestedEnd = addWorkingDays(val, Number(form.estimated_days));
      if (suggestedEnd) updateField('planned_end_date', suggestedEnd);
    }
  };

  const handleEndDateChange = (val: string) => {
    updateField('planned_end_date', val);
  };

  const handleEstimatedDaysChange = (val: string) => {
    updateField('estimated_days', val);
    const days = Number(val);
    if (days > 0) {
      updateField('estimated_hours', (days * 8).toString());
      // Suggest end date if start exists but end doesn't
      if (form.planned_start_date && !form.planned_end_date) {
        const suggestedEnd = addWorkingDays(form.planned_start_date, days);
        if (suggestedEnd) updateField('planned_end_date', suggestedEnd);
      }
    }
  };

  const handleClose = () => {
    if (dirty) {
      if (!confirm('You have unsaved changes. Discard?')) return;
    }
    onClose();
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!form.engagement_name.trim()) errors.push('Audit title is required');
    if (!form.department_id) errors.push('Department is required');
    if (!form.function_id) errors.push('Business function is required');
    if (!form.lead_auditor_id) errors.push('Lead auditor is required');
    if (!form.estimated_days) errors.push('Estimated days is required');
    if (form.planned_start_date && form.planned_end_date && form.planned_start_date > form.planned_end_date) {
      errors.push('Planned start date must be before end date');
    }
    // New validations
    if (form.inclusion_reason_codes.length === 0) errors.push('At least one inclusion reason is required');
    if (form.inclusion_reason_codes.includes('Other') && !form.inclusion_reason_notes.trim()) {
      errors.push('Inclusion notes are required when "Other" is selected');
    }
    if (form.expected_deliverable_codes.length === 0) errors.push('At least one expected deliverable is required');
    if (form.expected_deliverable_codes.includes('Other') && !form.expected_deliverable_notes.trim()) {
      errors.push('Deliverable notes are required when "Other" is selected');
    }
    return errors;
  };

  // Stage 2C (DEF-E2E-009): engagement_code is allocated server-side by the central
  // numbering engine and is immutable after allocation.


  // Derived values for display
  const derivedWeeks = form.estimated_days ? Math.ceil(Number(form.estimated_days) / 5) : null;
  const derivedQuarter = form.planned_start_date ? getQuarterFromDate(form.planned_start_date, fiscalYears) : null;
  const derivedMonth = form.planned_start_date ? getMonthFromDate(form.planned_start_date) : null;
  const leadAuditorName = mappedAuditors.find((a: any) => a.id === form.lead_auditor_id)?.name || '';

  // Fiscal year warning
  const fiscalYearWarning = useMemo(() => {
    if (!planFiscalYear || !form.planned_start_date) return '';
    const year = new Date(form.planned_start_date).getFullYear().toString();
    if (!planFiscalYear.includes(year)) {
      return `Start date (${year}) may fall outside fiscal year ${planFiscalYear}`;
    }
    return '';
  }, [planFiscalYear, form.planned_start_date]);

  const handleSubmit = () => {
    const errors = validate();
    if (errors.length > 0) {
      toast({ title: 'Validation Errors', description: errors[0], variant: 'destructive' });
      return;
    }

    // Build inclusion_rationale text from codes for backward compat
    const inclusionText = form.inclusion_reason_codes.join('; ') + (form.inclusion_reason_notes ? ` — ${form.inclusion_reason_notes}` : '');
    // Build expected_deliverable text from codes for backward compat
    const deliverableText = form.expected_deliverable_codes.join('; ') + (form.expected_deliverable_notes ? ` — ${form.expected_deliverable_notes}` : '');

    const payload: any = {
      engagement_name: form.engagement_name,
      annual_plan_id: planId,
      department_id: form.department_id || null,
      function_id: form.function_id || null,
      engagement_type: form.engagement_type,
      engagement_risk_rating: form.engagement_risk_rating || 'Medium',
      planned_start_date: form.planned_start_date || null,
      planned_end_date: form.planned_end_date || null,
      lead_auditor_id: form.lead_auditor_id || null,
      supportive_auditor_ids: form.supportive_auditor_ids,
      reviewer_id: form.reviewer_id || null,
      scope: form.scope || null,
      objectives: form.objectives || null,
      // status intentionally omitted: governed workflow state (Stage 2E / DEF-E2E-012)
      quarter: form.quarter || null,
      month: form.month || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      estimated_days: form.estimated_days ? Number(form.estimated_days) : null,
      inclusion_rationale: inclusionText || null,
      coverage_category: form.coverage_category || null,
      board_priority_flag: form.board_priority_flag,
      is_adhoc: form.is_adhoc,
      expected_deliverable: deliverableText || null,
      dependencies: form.dependencies || null,
      scheduling_notes: form.scheduling_notes || null,
      auditee_contact: form.primary_auditee_contact_id?.startsWith('name::') ? form.primary_auditee_contact_id.replace('name::', '') : (form.auditee_contact || null),
      auditable_area_summary: form.auditable_area_summary || null,
      sequence_no: form.sequence_no ? Number(form.sequence_no) : null,
      // New structured fields
      inclusion_reason_codes: form.inclusion_reason_codes,
      inclusion_reason_notes: form.inclusion_reason_notes || null,
      expected_deliverable_codes: form.expected_deliverable_codes,
      expected_deliverable_notes: form.expected_deliverable_notes || null,
      primary_auditee_contact_id: form.primary_auditee_contact_id && form.primary_auditee_contact_id !== '__manual__' && !form.primary_auditee_contact_id.startsWith('name::') ? form.primary_auditee_contact_id : null,
      secondary_auditee_contact_ids: (form.secondary_auditee_contact_ids || []).filter(id => !id.startsWith('name::')),
    };

    if (isEditMode) {
      payload.id = engagement.id;
    }
    // Create path: engagement_code is allocated server-side (Stage 2C, DEF-E2E-009).


    if (form.risk_override && form.risk_override_reason) {
      payload.risk_override_reason = form.risk_override_reason;
      payload.derived_risk_rating = form.derived_risk_rating;
    }

    onSave(payload);
  };

  const confirmOverride = (selectedRisk: string) => {
    if (!overrideReason.trim()) return;
    setForm(f => ({
      ...f,
      engagement_risk_rating: selectedRisk,
      risk_override: true,
      risk_override_reason: overrideReason.trim(),
    }));
    setDirty(true);
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
      setDirty(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
           <DialogTitle className="flex items-center gap-2 text-lg">
            {isEditMode ? 'Edit Audit' : 'Add Audit to Plan'}
            {isApprovedPlan && isEditMode && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Amendment Required</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identity" className="mt-3">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="identity" className="text-sm font-medium px-4 py-2">Identity & Coverage</TabsTrigger>
            <TabsTrigger value="planning" className="text-sm font-medium px-4 py-2">Planning Narrative</TabsTrigger>
            <TabsTrigger value="team" className="text-sm font-medium px-4 py-2">Team & Ownership</TabsTrigger>
            <TabsTrigger value="schedule" className="text-sm font-medium px-4 py-2">Schedule & Resources</TabsTrigger>
          </TabsList>

          {/* ===== Identity & Coverage ===== */}
          <TabsContent value="identity" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Audit Title <span className="text-destructive">*</span></Label>
                <Input value={form.engagement_name} onChange={e => updateField('engagement_name', e.target.value)} placeholder="e.g. IT Security Audit" />
              </div>
              <div>
                <Label>Audit Type</Label>
                <IaReferenceSelect
                  type="AUDIT_TYPE"
                  value={form.engagement_type}
                  onChange={v => updateField('engagement_type', v)}
                />

              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Department <span className="text-destructive">*</span></Label>
                <Select value={form.department_id} onValueChange={v => { updateField('department_id', v); updateField('function_id', ''); updateField('primary_auditee_contact_id', ''); updateField('secondary_auditee_contact_ids', []); }}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Business Function <span className="text-destructive">*</span></Label>
                <Select value={form.function_id} onValueChange={v => updateField('function_id', v)} disabled={!form.department_id}>
                  <SelectTrigger><SelectValue placeholder={form.department_id ? 'Select function' : 'Select department first'} /></SelectTrigger>
                  <SelectContent>{deptFunctions.map((fn: any) => <SelectItem key={fn.id} value={fn.id}>{fn.function_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Risk */}
            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Risk Rating</Label>
                </div>
                {form.risk_override ? (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearOverride}>Reset to Auto</Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setOverrideReason(''); setShowOverrideDialog(true); }} disabled={!form.department_id}>Override</Button>
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
                <Label>Coverage Category</Label>
                <IaReferenceSelect
                  type="COVERAGE_CATEGORY"
                  value={form.coverage_category}
                  onChange={v => updateField('coverage_category', v)}
                  placeholder="Select category"
                  allowClear
                />

              </div>
              <div>
                <Label>Status</Label>
                <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{form.status || 'Planned'}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Workflow status is governed &mdash; change it from the engagement workspace lifecycle actions.
                </p>
              </div>
            </div>

            {/* Structured Inclusion Rationale */}
            <MultiSelectChips
              label="Inclusion Rationale"
              required
              options={INCLUSION_REASONS}
              selected={form.inclusion_reason_codes}
              onChange={v => { updateField('inclusion_reason_codes', v); setDirty(true); }}
              maxSelections={2}
              helperText="Why is this audit included in the annual plan?"
            />
            {(form.inclusion_reason_codes.includes('Other') || form.inclusion_reason_notes) && (
              <div>
                <Label>
                  Additional Inclusion Notes
                  {form.inclusion_reason_codes.includes('Other') && <span className="text-destructive"> *</span>}
                </Label>
                <Textarea
                  value={form.inclusion_reason_notes}
                  onChange={e => updateField('inclusion_reason_notes', e.target.value)}
                  placeholder="Provide additional context for the inclusion rationale..."
                  rows={2}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sequence No.</Label>
                <Input type="number" value={form.sequence_no} onChange={e => updateField('sequence_no', e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="flex items-end gap-4 pb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.board_priority_flag} onCheckedChange={(c) => { updateField('board_priority_flag', !!c); }} />
                  Board Priority
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.is_adhoc} onCheckedChange={(c) => { updateField('is_adhoc', !!c); }} />
                  Ad-hoc Audit
                </label>
              </div>
            </div>
          </TabsContent>

          {/* ===== Planning Narrative ===== */}
          <TabsContent value="planning" className="space-y-5 mt-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Objective</Label>
              <Textarea value={form.objectives} onChange={e => updateField('objectives', e.target.value)} placeholder="What this engagement aims to achieve..." rows={4} className="text-sm leading-relaxed min-h-[100px] p-3" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Scope</Label>
              <Textarea value={form.scope} onChange={e => updateField('scope', e.target.value)} placeholder="What areas/processes will be reviewed..." rows={4} className="text-sm leading-relaxed min-h-[100px] p-3" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Auditable Area Summary</Label>
              <Textarea value={form.auditable_area_summary} onChange={e => updateField('auditable_area_summary', e.target.value)} placeholder="Key areas to be audited..." rows={3} className="text-sm leading-relaxed min-h-[80px] p-3" />
            </div>

            {/* Structured Expected Deliverables */}
            <MultiSelectChips
              label="Expected Deliverables"
              required
              options={DELIVERABLE_OPTIONS}
              selected={form.expected_deliverable_codes}
              onChange={v => { updateField('expected_deliverable_codes', v); setDirty(true); }}
              helperText="What outputs will this engagement produce?"
            />
            {(form.expected_deliverable_codes.includes('Other') || form.expected_deliverable_notes) && (
              <div>
                <Label>
                  Additional Deliverables Notes
                  {form.expected_deliverable_codes.includes('Other') && <span className="text-destructive"> *</span>}
                </Label>
                <Textarea
                  value={form.expected_deliverable_notes}
                  onChange={e => updateField('expected_deliverable_notes', e.target.value)}
                  placeholder="Describe any additional or custom deliverables..."
                  rows={2}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Dependencies / Preconditions</Label>
              <Textarea value={form.dependencies} onChange={e => updateField('dependencies', e.target.value)} placeholder="Any prerequisites or dependencies..." rows={3} className="text-sm leading-relaxed min-h-[80px] p-3" />
            </div>
          </TabsContent>

          {/* ===== Team & Ownership ===== */}
          <TabsContent value="team" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lead Auditor <span className="text-destructive">*</span></Label>
                <Select value={form.lead_auditor_id || '__none__'} onValueChange={v => updateField('lead_auditor_id', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select lead auditor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select —</SelectItem>
                    {mappedAuditors.filter((a: any) => !!a.id).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} — {a.role}</SelectItem>
                    ))}
                    {unmappedAuditors.length > 0 && (
                      <div className="px-2 py-1.5 border-t">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Info className="h-3 w-3" />{unmappedAuditors.length} auditor(s) hidden — not linked to system users
                        </p>
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reviewer</Label>
                <Select value={form.reviewer_id || '__none__'} onValueChange={v => updateField('reviewer_id', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {mappedAuditors.filter((a: any) => !!a.id).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} — {a.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Support Auditor(s)</Label>
              <div className="border rounded-md p-2 max-h-[120px] overflow-y-auto space-y-1 bg-background">
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
            </div>

            {/* Auditee Contact Selector */}
            <AuditeeContactSelector
              departmentId={form.department_id}
              functionId={form.function_id}
              departments={departments}
              deptFunctions={deptFunctions}
              primaryContactId={form.primary_auditee_contact_id}
              onPrimaryChange={v => { updateField('primary_auditee_contact_id', v); setDirty(true); }}
              secondaryContactIds={form.secondary_auditee_contact_ids}
              onSecondaryChange={v => { updateField('secondary_auditee_contact_ids', v); setDirty(true); }}
              manualContact={form.auditee_contact}
              onManualContactChange={v => { updateField('auditee_contact', v); setDirty(true); }}
            />
          </TabsContent>

          {/* ===== Schedule & Resources ===== */}
          <TabsContent value="schedule" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Planned Start Date</Label>
                <Input type="date" value={form.planned_start_date} onChange={e => handleStartDateChange(e.target.value)} />
              </div>
              <div>
                <Label>Planned End Date</Label>
                <Input type="date" value={form.planned_end_date} onChange={e => handleEndDateChange(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Estimated Days <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.estimated_days} onChange={e => handleEstimatedDaysChange(e.target.value)} placeholder="e.g. 15" />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {form.planned_start_date && form.planned_end_date ? 'Auto-calculated from date range (editable)' : 'Total working days'}
                </p>
              </div>
              <div>
                <Label>Estimated Hours</Label>
                <Input type="number" value={form.estimated_hours} onChange={e => updateField('estimated_hours', e.target.value)} placeholder="e.g. 120" />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {form.estimated_days ? `Derived: ${Number(form.estimated_days) * 8}h (8h/day)` : 'Based on days × 8'}
                </p>
              </div>
              <div>
                <Label>Estimated Weeks</Label>
                <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                  {derivedWeeks ? `${derivedWeeks} week${derivedWeeks !== 1 ? 's' : ''}` : '—'}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Auto-derived from days</p>
              </div>
            </div>

            {/* Quarter & Month derived */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Quarter</Label>
                  {derivedQuarter && !quarterOverride && (
                    <button type="button" className="text-[10px] text-primary underline" onClick={() => setQuarterOverride(true)}>Override</button>
                  )}
                  {quarterOverride && (
                    <button type="button" className="text-[10px] text-primary underline" onClick={() => { setQuarterOverride(false); if (derivedQuarter) updateField('quarter', derivedQuarter); }}>Reset to Auto</button>
                  )}
                </div>
                {quarterOverride ? (
                  <Select value={form.quarter} onValueChange={v => updateField('quarter', v)}>
                    <SelectTrigger><SelectValue placeholder="Select quarter" /></SelectTrigger>
                    <SelectContent>
                      {['Q1','Q2','Q3','Q4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50 text-sm">
                    {form.quarter ? (
                      <Badge variant="secondary">{form.quarter}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Set start date to auto-fill</span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Month</Label>
                  {derivedMonth && !monthOverride && (
                    <button type="button" className="text-[10px] text-primary underline" onClick={() => setMonthOverride(true)}>Override</button>
                  )}
                  {monthOverride && (
                    <button type="button" className="text-[10px] text-primary underline" onClick={() => { setMonthOverride(false); if (derivedMonth) updateField('month', derivedMonth); }}>Reset to Auto</button>
                  )}
                </div>
                {monthOverride ? (
                  <Select value={form.month} onValueChange={v => updateField('month', v)}>
                    <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50 text-sm">
                    {form.month ? (
                      <Badge variant="secondary">{form.month}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Set start date to auto-fill</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fiscal year warning */}
            {fiscalYearWarning && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">{fiscalYearWarning}</p>
              </div>
            )}

            {/* Resource Intelligence */}
            <ScheduleIntelligence
              leadAuditorId={form.lead_auditor_id}
              leadAuditorName={leadAuditorName}
              currentEngagementId={engagement?.id}
              allEngagements={allEngagements}
              plannedStartDate={form.planned_start_date}
              plannedEndDate={form.planned_end_date}
              quarter={form.quarter}
            />

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Scheduling Notes</Label>
              <Textarea value={form.scheduling_notes} onChange={e => updateField('scheduling_notes', e.target.value)} placeholder="Any scheduling considerations..." rows={3} className="text-sm leading-relaxed min-h-[80px] p-3" />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Add Engagement'}
          </Button>
        </DialogFooter>

        {/* Risk Override Sub-Dialog */}
        {showOverrideDialog && (
          <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />Override Risk Rating
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-muted/50 text-sm">
                  <p className="text-muted-foreground">Auto-derived risk:</p>
                  <StatusBadge status={form.derived_risk_rating || 'Medium'} />
                </div>
                <div>
                  <Label>New Risk Rating *</Label>
                  <Select onValueChange={v => updateField('engagement_risk_rating', v)}>
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
                  <Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Explain the override..." rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>Cancel</Button>
                <Button onClick={() => confirmOverride(form.engagement_risk_rating)} disabled={!overrideReason.trim()}>
                  Confirm Override
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
