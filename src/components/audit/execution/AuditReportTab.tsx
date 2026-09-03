import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Save, Eye, ArrowLeft, FileText, Briefcase,
  Users, Shield, Target, ClipboardList, MessageSquare, CheckCircle2,
  AlertTriangle, BookOpen, Lock, Clock, Printer, Mail,
  Settings2, History, Layers, PenTool, BarChart3, Hash,
  Sparkles, ExternalLink, Download, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIAAuditReports, useIAAuditReportMutations } from '@/hooks/useAuditReports';
import { useIADepartments } from '@/hooks/useAuditData';
import { useUserCode } from '@/hooks/useUserCode';
import { formatDateForDisplay } from '@/lib/format-config';
import { StatusBadge } from '@/components/common';
import { AuditReportPreview } from '@/components/audit/reports/AuditReportPreview';
import { useDocumentTemplateSections } from '@/hooks/useDocumentTemplateSections';
import { useDocumentFoundation } from '@/hooks/useDocumentFoundation';
import { AuditFindingCard } from '@/components/audit/reports/AuditFindingCard';
import { AuditReportWorkflowBar } from '@/components/audit/reports/AuditReportWorkflowBar';
import { ManagementResponseReportPreview } from '@/components/audit/reports/ManagementResponseReportPreview';
import { mapManagementResponseReport } from '@/lib/audit/managementResponseReportMapper';
import { useEngagementActivities, useEngagementEvidence, useEngagementWorkingPapers, useEngagementControlTests, useEngagementFollowUps } from '@/hooks/useEngagementData';
import { useNavigate } from 'react-router-dom';

interface AuditReportTabProps {
  auditId: string;
  audit: any;
  auditFindings: any[];
  auditResponses: any[];
  auditActions: any[];
  getDeptName: (id: string) => string;
  getAuditorName: (id: string) => string;
}

interface BuilderSection {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  required?: boolean;
}

const ALL_SECTIONS: BuilderSection[] = [
  { id: 'metadata', label: 'Report Metadata', icon: Settings2, enabled: true, required: true },
  { id: 'executive_summary', label: 'Executive Summary', icon: BookOpen, enabled: true },
  { id: 'background', label: 'Audit Context', icon: Layers, enabled: true },
  { id: 'objective', label: 'Objective', icon: Target, enabled: true },
  { id: 'scope', label: 'Scope', icon: Shield, enabled: true },
  { id: 'methodology', label: 'Methodology', icon: ClipboardList, enabled: true },
  { id: 'risk_overview', label: 'Risk Overview', icon: AlertTriangle, enabled: true },
  { id: 'findings', label: 'Findings', icon: AlertTriangle, enabled: true },
  { id: 'responses', label: 'Management Responses', icon: MessageSquare, enabled: true },
  { id: 'actions', label: 'Agreed Actions', icon: CheckCircle2, enabled: true },
  { id: 'conclusion', label: 'Conclusion', icon: FileText, enabled: true },
  { id: 'distribution', label: 'Distribution List', icon: Mail, enabled: true },
  { id: 'approval', label: 'Approval & Sign-off', icon: PenTool, enabled: true },
];

const OPINION_OPTIONS = ['Satisfactory', 'Needs Improvement', 'Unsatisfactory', 'Critical'];

export function AuditReportTab({ auditId, audit, auditFindings, auditResponses, auditActions, getDeptName, getAuditorName }: AuditReportTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userCode } = useUserCode();

  const { data: reports = [] } = useIAAuditReports();
  const { data: departments = [] } = useIADepartments();
  const { create, update } = useIAAuditReportMutations();
  const { sectionRefs: dbSectionRefs } = useDocumentTemplateSections('audit_report');
  const { data: foundation } = useDocumentFoundation();

  // Fetch additional workspace data for auto-population
  const { data: activities = [] } = useEngagementActivities(auditId);
  const { data: evidence = [] } = useEngagementEvidence(auditId);
  const { data: workingPapers = [] } = useEngagementWorkingPapers(auditId);
  const { data: controlTests = [] } = useEngagementControlTests(auditId);
  const { data: followUps = [] } = useEngagementFollowUps(auditId);

  // Find existing report for this engagement
  const existingReport = useMemo(() => reports.find((r: any) => r.engagement_id === auditId), [reports, auditId]);
  const allEngagementReports = useMemo(() => reports.filter((r: any) => r.engagement_id === auditId), [reports, auditId]);

  const [activeSection, setActiveSection] = useState('metadata');
  const [showPreview, setShowPreview] = useState(false);
  const [showMgmtResponsePreview, setShowMgmtResponsePreview] = useState(false);
  const [sections, setSections] = useState<BuilderSection[]>(ALL_SECTIONS);
  const [saving, setSaving] = useState(false);

  const [reportData, setReportData] = useState({
    title: '',
    report_type: 'Audit Report',
    engagement_id: auditId,
    department_id: '',
    executive_summary: '',
    overall_assessment: '',
    background: '',
    audit_objective: '',
    audit_scope: '',
    methodology: '',
    risk_rating: '',
    recommendations: '',
    follow_up_actions: '',
    conclusion: '',
    distribution_list: '',
    prepared_by: userCode || '',
    reviewed_by: '',
    approved_by: '',
    status: 'Draft',
    fiscal_year: new Date().getFullYear().toString(),
    report_number: '',
  });

  // Load existing report if found
  useEffect(() => {
    if (existingReport) {
      setReportData({
        title: existingReport.title || '',
        report_type: existingReport.report_type || 'Audit Report',
        engagement_id: auditId,
        department_id: existingReport.department_id || '',
        executive_summary: existingReport.executive_summary || '',
        overall_assessment: existingReport.overall_assessment || '',
        background: existingReport.background || '',
        audit_objective: existingReport.audit_objective || '',
        audit_scope: existingReport.audit_scope || '',
        methodology: existingReport.methodology || '',
        risk_rating: existingReport.risk_rating || '',
        recommendations: existingReport.recommendations || '',
        follow_up_actions: existingReport.follow_up_actions || '',
        conclusion: existingReport.conclusion || '',
        distribution_list: existingReport.distribution_list || '',
        prepared_by: existingReport.prepared_by || userCode || '',
        reviewed_by: existingReport.reviewed_by || '',
        approved_by: existingReport.approved_by || '',
        status: existingReport.status || 'Draft',
        fiscal_year: existingReport.fiscal_year || new Date().getFullYear().toString(),
        report_number: existingReport.report_number || '',
      });
    }
  }, [existingReport, userCode, auditId]);

  const departmentName = audit?.department_id ? getDeptName(audit.department_id) : '—';
  const leadAuditorName = audit?.lead_auditor_id ? getAuditorName(audit.lead_auditor_id) : '—';

  const isLocked = reportData.status === 'Final' || reportData.status === 'Submitted';
  const enabledSections = sections.filter((s) => s.enabled);

  // Risk distribution
  const riskCounts = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    auditFindings.forEach((f: any) => {
      if (f.risk_rating && counts[f.risk_rating as keyof typeof counts] !== undefined) {
        counts[f.risk_rating as keyof typeof counts]++;
      }
    });
    return counts;
  }, [auditFindings]);

  // Completeness tracking
  const completeness = useMemo(() => {
    const fields = [
      reportData.title, reportData.executive_summary, reportData.audit_objective,
      reportData.audit_scope, reportData.methodology, reportData.conclusion,
    ];
    const filled = fields.filter((f) => f && f.trim().length > 10).length;
    return Math.round((filled / fields.length) * 100);
  }, [reportData]);

  const wordCount = useMemo(() => {
    const text = [
      reportData.executive_summary, reportData.background, reportData.audit_objective,
      reportData.audit_scope, reportData.methodology, reportData.risk_rating,
      reportData.conclusion, reportData.follow_up_actions, reportData.distribution_list,
    ].join(' ');
    return text.split(/\s+/).filter(Boolean).length;
  }, [reportData]);

  const updateField = (key: string, value: string) => {
    setReportData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSection = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId && !s.required ? { ...s, enabled: !s.enabled } : s))
    );
  };

  // ===== Auto-populate from workspace data =====
  const autoPopulate = () => {
    const completedActivities = activities.filter((a: any) => a.status === 'Completed');
    const totalActivities = activities.length;
    const evidenceCount = evidence.length;
    const wpCount = workingPapers.length;
    const ctPassed = controlTests.filter((ct: any) => ct.test_result === 'Effective' || ct.test_result === 'Pass').length;
    const ctTotal = controlTests.length;
    const overdueActions = auditActions.filter((a: any) => a.target_date && !['Completed', 'Closed'].includes(a.status || '') && new Date(a.target_date) < new Date());
    const pendingFollowUps = followUps.filter((f: any) => f.status !== 'Completed' && f.status !== 'Closed');

    const riskNarrative = `Risk Distribution: Critical: ${riskCounts.Critical}, High: ${riskCounts.High}, Medium: ${riskCounts.Medium}, Low: ${riskCounts.Low}. ${
      riskCounts.Critical > 0 ? 'Immediate attention required for critical findings.' : ''
    } ${riskCounts.High > 0 ? `${riskCounts.High} high-risk finding(s) require timely remediation.` : ''}`.trim();

    const findingsSummary = auditFindings.map((f: any, i: number) => 
      `${i + 1}. ${f.title || 'Untitled'} (${f.risk_rating || 'Unrated'}): ${f.condition || f.description || 'No condition documented.'}`
    ).join('\n');

    const recommendationsSummary = auditFindings
      .filter((f: any) => f.recommendation)
      .map((f: any) => `• ${f.title}: ${f.recommendation}`)
      .join('\n');

    const executiveSummary = `This report presents the results of the "${audit?.engagement_name}" audit conducted for ${departmentName}. The audit was led by ${leadAuditorName} during the period ${audit?.planned_start_date ? formatDateForDisplay(audit.planned_start_date) : '—'} to ${audit?.planned_end_date ? formatDateForDisplay(audit.planned_end_date) : '—'}.

A total of ${auditFindings.length} finding(s) were identified across ${totalActivities} audit activities, with ${completedActivities.length} activities completed. ${evidenceCount} piece(s) of evidence and ${wpCount} working paper(s) were documented. ${ctTotal > 0 ? `Control testing covered ${ctTotal} control(s), of which ${ctPassed} were found effective.` : ''}

${auditResponses.length} management response(s) have been received and ${auditActions.length} corrective action(s) assigned${overdueActions.length > 0 ? `, with ${overdueActions.length} currently overdue` : ''}.${pendingFollowUps.length > 0 ? ` ${pendingFollowUps.length} follow-up item(s) remain pending.` : ''}`;

    const conclusionText = `Based on the audit procedures performed and evidence gathered, the audit team identified ${auditFindings.length} observation(s) requiring management attention. ${
      riskCounts.Critical > 0 || riskCounts.High > 0
        ? 'The overall control environment requires significant improvement. Management should prioritize remediation of critical and high-risk findings.'
        : riskCounts.Medium > 0
        ? 'The control environment is generally adequate with areas for improvement. Management should address the identified observations within the agreed timelines.'
        : 'The control environment is satisfactory. Minor observations noted should be addressed to strengthen existing controls.'
    }

Follow-up reviews will be conducted to verify implementation of agreed corrective actions.`;

    setReportData((prev) => ({
      ...prev,
      title: prev.title || `Audit Report — ${audit?.engagement_name || audit?.engagement_code}`,
      department_id: audit?.department_id || prev.department_id,
      executive_summary: executiveSummary,
      audit_objective: prev.audit_objective || audit?.objectives || '',
      audit_scope: prev.audit_scope || audit?.scope || '',
      methodology: prev.methodology || audit?.methodology || 'The audit was conducted in accordance with the International Standards for the Professional Practice of Internal Auditing (IPPF). Procedures included interviews, document reviews, control testing, data analysis, and walkthrough observations.',
      risk_rating: riskNarrative,
      recommendations: recommendationsSummary || 'No specific recommendations — all findings have been addressed.',
      conclusion: conclusionText,
      fiscal_year: audit?.planned_start_date ? String(new Date(audit.planned_start_date).getFullYear()) : prev.fiscal_year,
      overall_assessment: prev.overall_assessment || (
        riskCounts.Critical > 0 ? 'Critical' :
        riskCounts.High > 0 ? 'Unsatisfactory' :
        riskCounts.Medium > 0 ? 'Needs Improvement' : 'Satisfactory'
      ),
      follow_up_actions: prev.follow_up_actions || `Management is expected to implement all agreed corrective actions by the specified target dates. A follow-up audit will be scheduled to verify implementation progress.${overdueActions.length > 0 ? `\n\nNote: ${overdueActions.length} action(s) are currently overdue and require immediate attention.` : ''}`,
      background: prev.background || `The ${audit?.engagement_name} audit was included in the ${audit?.planned_start_date ? new Date(audit.planned_start_date).getFullYear() : 'annual'} Internal Audit Plan${audit?.inclusion_reason_codes?.length ? ` based on: ${(audit.inclusion_reason_codes as string[]).join(', ')}` : ''}. The engagement covered the ${departmentName} department${audit?.function_id ? ` focusing on the relevant business function` : ''}.`,
    }));
    toast({ title: 'Report auto-populated', description: 'All sections populated from workspace data (findings, activities, evidence, control tests, follow-ups).' });
  };

  const handleSave = () => {
    if (!reportData.title) {
      toast({ title: 'Title required', description: 'Please enter a report title.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (existingReport) {
      update.mutate({ id: existingReport.id, ...reportData } as any, {
        onSuccess: () => { setSaving(false); toast({ title: 'Report saved' }); },
        onError: () => setSaving(false),
      });
    } else {
      create.mutate({
        ...reportData,
        created_by: userCode || null,
        generated_on: new Date().toISOString(),
      } as any, {
        onSuccess: () => { setSaving(false); toast({ title: 'Report created' }); },
        onError: () => setSaving(false),
      });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (existingReport) {
      update.mutate(
        { id: existingReport.id, status: newStatus, ...(newStatus === 'Final' ? { issued_at: new Date().toISOString(), issued_by: userCode } : {}) } as any,
        { onSuccess: () => { toast({ title: `Report status: ${newStatus}` }); setReportData((p) => ({ ...p, status: newStatus })); } }
      );
    } else {
      setReportData((p) => ({ ...p, status: newStatus }));
    }
  };

  // Management Response Report data
  const mgmtResponseData = useMemo(
    () => mapManagementResponseReport(audit, auditFindings, auditResponses, auditActions, departmentName),
    [audit, auditFindings, auditResponses, auditActions, departmentName]
  );

  // Show management response preview
  if (showMgmtResponsePreview) {
    return (
      <ManagementResponseReportPreview
        data={mgmtResponseData}
        onClose={() => setShowMgmtResponsePreview(false)}
      />
    );
  }

  // Show audit report preview
  if (showPreview) {
    return (
      <AuditReportPreview
        reportData={reportData}
        findings={auditFindings}
        responses={auditResponses}
        actions={auditActions}
        engagement={audit}
        departmentName={departmentName}
        dbSectionRefs={dbSectionRefs}
        foundation={foundation}
        onClose={() => setShowPreview(false)}
        onPrint={() => window.print()}
      />
    );
  }

  return (
    <div className="space-y-0">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between border rounded-t-lg bg-background px-4 py-2.5 gap-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{reportData.title || 'New Audit Report'}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{reportData.report_type}</span>
              {wordCount > 0 && <><span>·</span><span>{wordCount} words</span></>}
              {existingReport && <><span>·</span><span>{existingReport.report_number}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={autoPopulate} disabled={isLocked} className="text-primary border-primary/30 hover:bg-primary/5">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Auto-Populate
          </Button>
          <AuditReportWorkflowBar
            currentStatus={reportData.status}
            onStatusChange={handleStatusChange}
            disabled={!existingReport}
          />
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={() => setShowMgmtResponsePreview(true)}>
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Mgmt Response Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isLocked || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex border border-t-0 rounded-b-lg overflow-hidden" style={{ height: 'calc(100vh - 22rem)' }}>
        {/* Left Sidebar - Section Navigation */}
        <div className="w-52 border-r bg-muted/20 shrink-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Sections</p>
              {enabledSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <section.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              ))}
              <Separator className="my-3" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Toggle</p>
              {sections.filter((s) => !s.required).map((section) => (
                <div key={section.id} className="flex items-center justify-between px-3 py-1">
                  <span className="text-[10px] truncate">{section.label}</span>
                  <Switch checked={section.enabled} onCheckedChange={() => toggleSection(section.id)} className="scale-[0.65]" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-5 space-y-5">
            {activeSection === 'metadata' && (
              <SectionCard title="Report Metadata" icon={Settings2}>
                <div className="grid gap-4">
                  <div>
                    <Label>Report Title</Label>
                    <Input value={reportData.title} onChange={(e) => updateField('title', e.target.value)} disabled={isLocked} placeholder="Enter report title..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Fiscal Year</Label>
                      <Input value={reportData.fiscal_year} onChange={(e) => updateField('fiscal_year', e.target.value)} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Report Type</Label>
                      <Input value={reportData.report_type} disabled className="bg-muted/30" />
                    </div>
                  </div>
                  {/* Auto-populated context cards */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Auto-populated from Workspace</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Engagement', value: audit?.engagement_name },
                        { label: 'Department', value: departmentName },
                        { label: 'Lead Auditor', value: leadAuditorName },
                        { label: 'Period', value: `${audit?.planned_start_date ? formatDateForDisplay(audit.planned_start_date) : '—'} to ${audit?.planned_end_date ? formatDateForDisplay(audit.planned_end_date) : '—'}` },
                        { label: 'Findings', value: auditFindings.length },
                        { label: 'Activities', value: activities.length },
                        { label: 'Evidence', value: evidence.length },
                        { label: 'Working Papers', value: workingPapers.length },
                        { label: 'Control Tests', value: controlTests.length },
                        { label: 'Responses', value: auditResponses.length },
                        { label: 'Actions', value: auditActions.length },
                        { label: 'Follow-ups', value: followUps.length },
                      ].map((item) => (
                        <div key={item.label} className="p-2 rounded bg-background border border-border/50">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-medium truncate">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'executive_summary' && (
              <SectionCard title="Executive Summary" icon={BookOpen}>
                <div className="space-y-4">
                  <div>
                    <Label>Overall Assessment / Opinion</Label>
                    <Select value={reportData.overall_assessment} onValueChange={(v) => updateField('overall_assessment', v)} disabled={isLocked}>
                      <SelectTrigger><SelectValue placeholder="Select overall assessment..." /></SelectTrigger>
                      <SelectContent>
                        {OPINION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {reportData.overall_assessment && (
                      <div className="mt-2">
                        <OpinionBadge opinion={reportData.overall_assessment} />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Summary Narrative</Label>
                    <Textarea rows={10} value={reportData.executive_summary} onChange={(e) => updateField('executive_summary', e.target.value)} disabled={isLocked} placeholder="High-level summary of audit results..." className="leading-relaxed text-sm" />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'background' && (
              <SectionCard title="Audit Context / Background" icon={Layers}>
                <Textarea rows={6} value={reportData.background} onChange={(e) => updateField('background', e.target.value)} disabled={isLocked} placeholder="Describe the background context for this audit..." className="leading-relaxed text-sm" />
              </SectionCard>
            )}

            {activeSection === 'objective' && (
              <SectionCard title="Audit Objective" icon={Target}>
                <Textarea rows={5} value={reportData.audit_objective} onChange={(e) => updateField('audit_objective', e.target.value)} disabled={isLocked} placeholder="State the audit objective(s)..." className="leading-relaxed text-sm" />
              </SectionCard>
            )}

            {activeSection === 'scope' && (
              <SectionCard title="Audit Scope" icon={Shield}>
                <Textarea rows={5} value={reportData.audit_scope} onChange={(e) => updateField('audit_scope', e.target.value)} disabled={isLocked} placeholder="Define the scope of the audit..." className="leading-relaxed text-sm" />
              </SectionCard>
            )}

            {activeSection === 'methodology' && (
              <SectionCard title="Methodology" icon={ClipboardList}>
                <Textarea rows={5} value={reportData.methodology} onChange={(e) => updateField('methodology', e.target.value)} disabled={isLocked} placeholder="Describe the audit methodology..." className="leading-relaxed text-sm" />
              </SectionCard>
            )}

            {activeSection === 'risk_overview' && (
              <SectionCard title="Risk Overview" icon={AlertTriangle}>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    {(['Critical', 'High', 'Medium', 'Low'] as const).map((level) => {
                      const count = riskCounts[level];
                      const colors: Record<string, string> = {
                        Critical: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                        High: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
                        Medium: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
                        Low: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800',
                      };
                      return (
                        <div key={level} className={`rounded-lg border p-3 text-center ${colors[level]}`}>
                          <p className="text-2xl font-bold">{count}</p>
                          <p className="text-xs font-medium">{level}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <Label>Risk Narrative</Label>
                    <Textarea rows={4} value={reportData.risk_rating} onChange={(e) => updateField('risk_rating', e.target.value)} disabled={isLocked} placeholder="Summarize risk distribution..." className="leading-relaxed text-sm" />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'findings' && (
              <SectionCard title={`Detailed Findings (${auditFindings.length})`} icon={AlertTriangle}>
                {auditFindings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No findings recorded for this engagement</p>
                    <p className="text-xs mt-1">Add findings in the Findings tab first</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border overflow-hidden mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 text-xs text-muted-foreground">
                            <th className="text-left p-2.5 font-medium w-8">#</th>
                            <th className="text-left p-2.5 font-medium">Finding</th>
                            <th className="text-left p-2.5 font-medium w-20">Risk</th>
                            <th className="text-left p-2.5 font-medium w-20">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditFindings.map((f: any, i: number) => (
                            <tr key={f.id} className="border-t">
                              <td className="p-2.5 font-medium">{i + 1}</td>
                              <td className="p-2.5">{f.title || 'Untitled'}</td>
                              <td className="p-2.5"><Badge variant="outline" className="text-xs">{f.risk_rating || '—'}</Badge></td>
                              <td className="p-2.5"><StatusBadge status={f.status || 'Open'} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Separator />
                    {auditFindings.map((f: any, i: number) => (
                      <AuditFindingCard key={f.id} finding={f} index={i + 1} responses={auditResponses} actions={auditActions} />
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeSection === 'responses' && (
              <SectionCard title={`Management Responses (${auditResponses.length})`} icon={MessageSquare}>
                {auditResponses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No management responses recorded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {auditResponses.map((r: any, i: number) => {
                      const finding = auditFindings.find((f: any) => f.id === r.finding_id);
                      return (
                        <Card key={r.id} className="border-l-4 border-l-blue-400">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <p className="text-sm font-semibold">Response {i + 1}: {finding?.title || 'Finding'}</p>
                              <StatusBadge status={r.status || 'Pending'} />
                            </div>
                            <p className="text-sm leading-relaxed">{r.response_text || '—'}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            )}

            {activeSection === 'actions' && (
              <SectionCard title={`Agreed Actions (${auditActions.length})`} icon={CheckCircle2}>
                {auditActions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No corrective actions recorded</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left p-2 font-medium">#</th>
                          <th className="text-left p-2 font-medium">Action</th>
                          <th className="text-left p-2 font-medium">Owner</th>
                          <th className="text-left p-2 font-medium">Due Date</th>
                          <th className="text-left p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditActions.map((a: any, i: number) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{i + 1}</td>
                            <td className="p-2">{a.action_description || '—'}</td>
                            <td className="p-2">{a.responsible_person || '—'}</td>
                            <td className="p-2">{a.target_date ? formatDateForDisplay(a.target_date) : '—'}</td>
                            <td className="p-2"><StatusBadge status={a.status || 'Open'} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            {activeSection === 'conclusion' && (
              <SectionCard title="Conclusion" icon={FileText}>
                <div className="space-y-4">
                  <Textarea rows={6} value={reportData.conclusion} onChange={(e) => updateField('conclusion', e.target.value)} disabled={isLocked} placeholder="State the overall conclusion..." className="leading-relaxed text-sm" />
                  <div>
                    <Label>Follow-up Expectations</Label>
                    <Textarea rows={3} value={reportData.follow_up_actions} onChange={(e) => updateField('follow_up_actions', e.target.value)} disabled={isLocked} placeholder="Define follow-up actions and timelines..." className="leading-relaxed text-sm mt-1" />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'distribution' && (
              <SectionCard title="Distribution List" icon={Mail}>
                <Textarea rows={4} value={reportData.distribution_list} onChange={(e) => updateField('distribution_list', e.target.value)} disabled={isLocked} placeholder="List the recipients (Name — Title — Copy Type)..." className="leading-relaxed text-sm" />
              </SectionCard>
            )}

            {activeSection === 'approval' && (
              <SectionCard title="Approval & Sign-off" icon={PenTool}>
                <div className="grid gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Prepared By</Label>
                      <Input value={reportData.prepared_by} onChange={(e) => updateField('prepared_by', e.target.value)} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Reviewed By</Label>
                      <Input value={reportData.reviewed_by} onChange={(e) => updateField('reviewed_by', e.target.value)} disabled={isLocked} />
                    </div>
                    <div>
                      <Label>Approved By</Label>
                      <Input value={reportData.approved_by} onChange={(e) => updateField('approved_by', e.target.value)} disabled={isLocked} />
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        </div>

        {/* Right Sidebar - Metadata */}
        <div className="w-56 border-l bg-muted/10 shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Completeness */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completeness</p>
              <Progress value={completeness} className="h-2 mb-1" />
              <p className="text-[10px] text-muted-foreground">{completeness}% of key sections filled</p>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Report Info</p>
              <div className="space-y-2">
                <InfoRow label="Status"><StatusBadge status={reportData.status} /></InfoRow>
                <InfoRow label="Type"><Badge variant="outline" className="text-[10px]">{reportData.report_type}</Badge></InfoRow>
                <InfoRow label="Year">{reportData.fiscal_year}</InfoRow>
                <InfoRow label="Words"><span className="text-xs tabular-nums">{wordCount}</span></InfoRow>
                {reportData.report_number && <InfoRow label="Report #">{reportData.report_number}</InfoRow>}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Data Sources</p>
              <div className="space-y-2">
                <InfoRow label="Findings"><Badge variant="secondary" className="text-[10px]">{auditFindings.length}</Badge></InfoRow>
                <InfoRow label="Activities"><Badge variant="secondary" className="text-[10px]">{activities.length}</Badge></InfoRow>
                <InfoRow label="Evidence"><Badge variant="secondary" className="text-[10px]">{evidence.length}</Badge></InfoRow>
                <InfoRow label="Working Papers"><Badge variant="secondary" className="text-[10px]">{workingPapers.length}</Badge></InfoRow>
                <InfoRow label="Control Tests"><Badge variant="secondary" className="text-[10px]">{controlTests.length}</Badge></InfoRow>
                <InfoRow label="Responses"><Badge variant="secondary" className="text-[10px]">{auditResponses.length}</Badge></InfoRow>
                <InfoRow label="Actions"><Badge variant="secondary" className="text-[10px]">{auditActions.length}</Badge></InfoRow>
                <InfoRow label="Follow-ups"><Badge variant="secondary" className="text-[10px]">{followUps.length}</Badge></InfoRow>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</p>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => setShowPreview(true)}>
                  <Eye className="h-3.5 w-3.5 mr-2" /> Preview Report
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-2" /> Print
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => navigate('/audit/audit-reports')}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Report Center
                </Button>
              </div>
            </div>

            {/* Existing Reports for this engagement */}
            {allEngagementReports.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Report History</p>
                  <div className="space-y-2">
                    {allEngagementReports.map((r: any) => (
                      <div key={r.id} className="p-2 rounded border bg-background text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/audit/report-builder?id=${r.id}`)}>
                        <p className="font-medium truncate">{r.title || 'Untitled'}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-muted-foreground">{r.report_number || '—'}</span>
                          <StatusBadge status={r.status || 'Draft'} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{children}</span>
    </div>
  );
}

function OpinionBadge({ opinion }: { opinion: string }) {
  const styles: Record<string, string> = {
    Satisfactory: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400',
    'Needs Improvement': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400',
    Unsatisfactory: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/30 dark:text-orange-400',
    Critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/30 dark:text-red-400',
  };
  return (
    <Badge className={`${styles[opinion] || 'bg-muted'} border text-xs font-semibold`}>
      Overall Assessment: {opinion}
    </Badge>
  );
}
