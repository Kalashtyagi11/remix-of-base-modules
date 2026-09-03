import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuditReportTemplate } from '@/hooks/useAuditDocumentTemplates';
import { Button } from '@/components/ui/button';
import type { ReportTemplateOverride } from '@/lib/audit/documentTemplateOverrides';
import { applyReportOverrides, createEmptyReportOverride, hasReportOverrides } from '@/lib/audit/documentTemplateOverrides';
import { ReportOverridePanel } from '@/components/audit/templates/ReportOverridePanel';
import { LiveDocumentPreview } from '@/components/audit/templates/LiveDocumentPreview';
import { DEFAULT_AUDIT_REPORT_CONFIG } from '@/lib/audit/documentTemplateDefaults';
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
  Save, Eye, Download, ArrowLeft, FileText, Briefcase,
  Users, Shield, Target, ClipboardList, MessageSquare, CheckCircle2,
  AlertTriangle, BookOpen, Lock, Clock, Printer, Mail,
  Settings2, History, Layers, PenTool, BarChart3, Hash
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIAAuditReports, useIAAuditReportMutations } from '@/hooks/useAuditReports';
import { useIAEngagements } from '@/hooks/useAuditDataPhase2';
import { useIADepartments, useIAFindings, useIAManagementResponses, useIAActionTracking } from '@/hooks/useAuditData';
import { useUserCode } from '@/hooks/useUserCode';
import { formatDateForDisplay } from '@/lib/format-config';
import { StatusBadge } from '@/components/common';
import { AuditReportPreview } from './AuditReportPreview';
import { useDocumentTemplateSections } from '@/hooks/useDocumentTemplateSections';
import { useDocumentFoundation } from '@/hooks/useDocumentFoundation';
import { useAuditReportPriorMatters } from '@/hooks/useAuditReportPriorMatters';
import { AuditFindingCard } from './AuditFindingCard';
import { AuditReportVersionTimeline } from './AuditReportVersionTimeline';
import { AuditReportWorkflowBar } from './AuditReportWorkflowBar';
import { AuditReportTemplateSelector, REPORT_TEMPLATES } from './AuditReportTemplateSelector';
import type { ReportTemplate } from './AuditReportTemplateSelector';
import { AuditPortfolioSection } from './sections/AuditPortfolioSection';
import { AuditExecutiveDashboardSection } from './sections/AuditExecutiveDashboardSection';
import { formatDepartmentLabel } from '@/lib/audit/departmentLabel';

interface BuilderSection {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  required?: boolean;
}

const ALL_SECTIONS: BuilderSection[] = [
  { id: 'metadata', label: 'Metadata', icon: Settings2, enabled: true, required: true },
  { id: 'executive_summary', label: 'Executive Summary', icon: BookOpen, enabled: true },
  { id: 'background', label: 'Audit Context', icon: Layers, enabled: true },
  { id: 'objective', label: 'Objective', icon: Target, enabled: true },
  { id: 'scope', label: 'Scope', icon: Shield, enabled: true },
  { id: 'methodology', label: 'Methodology', icon: ClipboardList, enabled: true },
  { id: 'risk_overview', label: 'Risk Overview', icon: AlertTriangle, enabled: true },
  { id: 'portfolio', label: 'Portfolio Progress', icon: BarChart3, enabled: false },
  { id: 'executive_dashboard', label: 'Executive Dashboard', icon: Briefcase, enabled: false },
  { id: 'findings', label: 'Findings', icon: AlertTriangle, enabled: true },
  { id: 'responses', label: 'Management Responses', icon: MessageSquare, enabled: true },
  { id: 'actions', label: 'Agreed Actions', icon: CheckCircle2, enabled: true },
  { id: 'conclusion', label: 'Conclusion', icon: FileText, enabled: true },
  { id: 'distribution', label: 'Distribution List', icon: Mail, enabled: true },
  { id: 'approval', label: 'Approval & Sign-off', icon: PenTool, enabled: true },
];

const OPINION_OPTIONS = ['Satisfactory', 'Needs Improvement', 'Unsatisfactory', 'Critical'];

export function AuditReportBuilderStudio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { userCode } = useUserCode();

  const reportId = searchParams.get('id');
  const templateParam = searchParams.get('template') || '';

  const { data: reports = [] } = useIAAuditReports();
  const { data: engagements = [] } = useIAEngagements();
  const { data: departments = [] } = useIADepartments();
  const { data: findings = [] } = useIAFindings();
  const { data: responses = [] } = useIAManagementResponses();
  const { data: actions = [] } = useIAActionTracking();
  const { sectionRefs: dbSectionRefs } = useDocumentTemplateSections('audit_report');
  const { data: foundation } = useDocumentFoundation();
  const { create, update } = useIAAuditReportMutations();

  const [activeSection, setActiveSection] = useState('metadata');
  const [showPreview, setShowPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [sections, setSections] = useState<BuilderSection[]>(ALL_SECTIONS);
  const [reportOverrides, setReportOverrides] = useState<ReportTemplateOverride>(createEmptyReportOverride());
  const [showOverridePanel, setShowOverridePanel] = useState(false);

  const [reportData, setReportData] = useState({
    title: '',
    report_type: 'Audit Report',
    engagement_id: '',
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
  });

  const existingReport = useMemo(() => reports.find((r: any) => r.id === reportId), [reports, reportId]);

  // Load existing report
  useEffect(() => {
    if (existingReport) {
      setReportData({
        title: existingReport.title || '',
        report_type: existingReport.report_type || 'Audit Report',
        engagement_id: existingReport.engagement_id || '',
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
      });
    }
  }, [existingReport, userCode]);

  // Apply template from URL param (only for new reports)
  useEffect(() => {
    if (templateParam && !reportId) {
      const template = REPORT_TEMPLATES.find((t) => t.id === templateParam);
      if (template) applyTemplate(template);
      else setShowTemplateSelector(true);
    } else if (!reportId && !templateParam) {
      setShowTemplateSelector(true);
    }
  }, [templateParam, reportId]);

  const applyTemplate = (template: ReportTemplate) => {
    setSections(
      ALL_SECTIONS.map((s) => ({
        ...s,
        enabled: s.required || template.sections.includes(s.id),
      }))
    );
    setReportData((prev) => ({ ...prev, report_type: template.reportType }));
  };

  const selectedEngagement = useMemo(
    () => engagements.find((e: any) => e.id === reportData.engagement_id),
    [engagements, reportData.engagement_id]
  );

  const engagementFindings = useMemo(
    () => findings.filter((f: any) => f.engagement_id === reportData.engagement_id),
    [findings, reportData.engagement_id]
  );

  const engagementResponses = useMemo(() => {
    const findingIds = new Set(engagementFindings.map((f: any) => f.id));
    return responses.filter((r: any) => r.engagement_id === reportData.engagement_id || findingIds.has(r.finding_id));
  }, [responses, engagementFindings, reportData.engagement_id]);

  const engagementActions = useMemo(
    () => actions.filter((a: any) => a.engagement_id === reportData.engagement_id),
    [actions, reportData.engagement_id]
  );

  const isLocked = reportData.status === 'Final' || reportData.status === 'Submitted';
  const enabledSections = sections.filter((s) => s.enabled);

  // Content completeness
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

  const handleSave = () => {
    if (!reportData.title) {
      toast({ title: 'Title required', description: 'Please enter a report title.', variant: 'destructive' });
      return;
    }
    if (reportId && existingReport) {
      update.mutate({ id: reportId, ...reportData } as any, {
        onSuccess: () => toast({ title: 'Report saved' }),
      });
    } else {
      create.mutate(
        {
          ...reportData,
          created_by: userCode || null,
          generated_on: new Date().toISOString(),
        } as any,
        {
          onSuccess: (data: any) => {
            toast({ title: 'Report created' });
            navigate(`/audit/report-builder?id=${data.id}`, { replace: true });
          },
        }
      );
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (reportId) {
      update.mutate(
        { id: reportId, status: newStatus, ...(newStatus === 'Final' ? { issued_at: new Date().toISOString(), issued_by: userCode } : {}) } as any,
        { onSuccess: () => { toast({ title: `Report status: ${newStatus}` }); setReportData((p) => ({ ...p, status: newStatus })); } }
      );
    } else {
      setReportData((p) => ({ ...p, status: newStatus }));
    }
  };

  const autoPopulate = () => {
    if (!selectedEngagement) return;
    const dept = departments.find((d: any) => d.id === selectedEngagement.department_id);
    const riskCounts = engagementFindings.reduce((acc: Record<string, number>, f: any) => {
      const k = f.risk_rating || 'Unrated';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    setReportData((prev) => ({
      ...prev,
      title: prev.title || `Audit Report — ${selectedEngagement.engagement_name || selectedEngagement.engagement_code}`,
      department_id: selectedEngagement.department_id || prev.department_id,
      executive_summary: prev.executive_summary || `This report presents the results of the ${selectedEngagement.engagement_name} audit conducted for ${formatDepartmentLabel(dept) !== '—' ? formatDepartmentLabel(dept) : 'the department'}. ${engagementFindings.length} finding(s) were identified.`,
      audit_objective: prev.audit_objective || selectedEngagement.objectives || '',
      audit_scope: prev.audit_scope || selectedEngagement.scope || '',
      methodology: prev.methodology || selectedEngagement.methodology || '',
      risk_rating: prev.risk_rating || Object.entries(riskCounts).map(([k, v]) => `${k}: ${v}`).join(' | '),
      fiscal_year: selectedEngagement.planned_start_date ? String(new Date(selectedEngagement.planned_start_date).getFullYear()) : prev.fiscal_year,
    }));
    toast({ title: 'Auto-populated from audit data' });
  };

  const handleTemplateSelect = (template: ReportTemplate) => {
    setShowTemplateSelector(false);
    applyTemplate(template);
  };

  const { data: reportTemplateConfig } = useAuditReportTemplate();
  const effectiveTemplateConfig = useMemo(
    () => applyReportOverrides(reportTemplateConfig || DEFAULT_AUDIT_REPORT_CONFIG, reportOverrides),
    [reportTemplateConfig, reportOverrides]
  );

  // Phase E — fetch linked prior employer matters for the inspection backing this report (if any)
  const inspectionIdForReport = (reportData as any).inspection_id || (selectedEngagement as any)?.inspection_id || null;
  const { data: priorMatters = [] } = useAuditReportPriorMatters(inspectionIdForReport);

  if (showPreview) {
    return (
      <AuditReportPreview
        reportData={reportData}
        findings={engagementFindings}
        responses={engagementResponses}
        actions={engagementActions}
        engagement={selectedEngagement}
        departmentName={formatDepartmentLabel(departments.find((d: any) => d.id === reportData.department_id))}
        templateConfig={effectiveTemplateConfig}
        dbSectionRefs={dbSectionRefs}
        foundation={foundation}
        priorMatters={priorMatters}
        onClose={() => setShowPreview(false)}
        onPrint={() => window.print()}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate('/audit/audit-reports')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{reportData.title || 'New Report'}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{reportData.report_type}</span>
              {wordCount > 0 && (
                <>
                  <span>·</span>
                  <span>{wordCount} words</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AuditReportWorkflowBar
            currentStatus={reportData.status}
            onStatusChange={handleStatusChange}
            disabled={!reportId}
          />
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={() => setShowVersions(!showVersions)}>
            <History className="h-4 w-4 mr-1" /> Versions
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isLocked}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Section Navigation */}
        <div className="w-56 border-r bg-muted/20 shrink-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Sections</p>
              {enabledSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              ))}
              <Separator className="my-3" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Toggle Sections</p>
              {sections.filter((s) => !s.required).map((section) => (
                <div key={section.id} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs truncate">{section.label}</span>
                  <Switch
                    checked={section.enabled}
                    onCheckedChange={() => toggleSection(section.id)}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {activeSection === 'metadata' && (
              <SectionCard title="Report Metadata" icon={Settings2}>
                <div className="grid gap-4">
                  <div>
                    <Label>Report Title</Label>
                    <Input value={reportData.title} onChange={(e) => updateField('title', e.target.value)} disabled={isLocked} placeholder="Enter report title..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Report Type</Label>
                      <Select value={reportData.report_type} onValueChange={(v) => updateField('report_type', v)} disabled={isLocked}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REPORT_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.reportType}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fiscal Year</Label>
                      <Input value={reportData.fiscal_year} onChange={(e) => updateField('fiscal_year', e.target.value)} disabled={isLocked} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                    <Label>Linked Audit</Label>
                      <Select value={reportData.engagement_id} onValueChange={(v) => updateField('engagement_id', v)} disabled={isLocked}>
                        <SelectTrigger><SelectValue placeholder="Select audit..." /></SelectTrigger>
                        <SelectContent>
                          {engagements.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.engagement_name || e.engagement_code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Department</Label>
                      <Select value={reportData.department_id} onValueChange={(v) => updateField('department_id', v)} disabled={isLocked}>
                        <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                        <SelectContent>
                          {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {selectedEngagement && (
                    <Button variant="outline" size="sm" onClick={autoPopulate} disabled={isLocked}>
                      <Layers className="h-4 w-4 mr-2" /> Auto-populate from Engagement
                    </Button>
                  )}
                </div>
              </SectionCard>
            )}

            {activeSection === 'executive_summary' && (
              <SectionCard title="Executive Summary" icon={BookOpen}>
                <div className="space-y-4">
                  <div>
                    <Label>Overall Assessment / Opinion</Label>
                    <Select value={reportData.overall_assessment} onValueChange={(v) => updateField('overall_assessment', v)} disabled={isLocked}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select overall assessment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {OPINION_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
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
                    <Textarea
                      rows={8}
                      value={reportData.executive_summary}
                      onChange={(e) => updateField('executive_summary', e.target.value)}
                      disabled={isLocked}
                      placeholder="Provide a high-level summary of audit results, key findings, and overall assessment..."
                      className="leading-relaxed text-sm"
                    />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'background' && (
              <SectionCard title="Audit Context / Background" icon={Layers}>
                <Textarea
                  rows={6}
                  value={reportData.background}
                  onChange={(e) => updateField('background', e.target.value)}
                  disabled={isLocked}
                  placeholder="Describe the background context for this audit..."
                  className="leading-relaxed text-sm"
                />
              </SectionCard>
            )}

            {activeSection === 'objective' && (
              <SectionCard title="Audit Objective" icon={Target}>
                <Textarea
                  rows={5}
                  value={reportData.audit_objective}
                  onChange={(e) => updateField('audit_objective', e.target.value)}
                  disabled={isLocked}
                  placeholder="State the objective(s) of this audit..."
                  className="leading-relaxed text-sm"
                />
              </SectionCard>
            )}

            {activeSection === 'scope' && (
              <SectionCard title="Audit Scope" icon={Shield}>
                <Textarea
                  rows={5}
                  value={reportData.audit_scope}
                  onChange={(e) => updateField('audit_scope', e.target.value)}
                  disabled={isLocked}
                  placeholder="Define the scope of the audit, including period, processes, and areas covered..."
                  className="leading-relaxed text-sm"
                />
              </SectionCard>
            )}

            {activeSection === 'methodology' && (
              <SectionCard title="Methodology" icon={ClipboardList}>
                <Textarea
                  rows={5}
                  value={reportData.methodology}
                  onChange={(e) => updateField('methodology', e.target.value)}
                  disabled={isLocked}
                  placeholder="Describe the audit methodology, techniques, and approach used..."
                  className="leading-relaxed text-sm"
                />
              </SectionCard>
            )}

            {activeSection === 'risk_overview' && (
              <SectionCard title="Risk Overview" icon={AlertTriangle}>
                <div className="space-y-4">
                  {engagementFindings.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {['Critical', 'High', 'Medium', 'Low'].map((level) => {
                        const count = engagementFindings.filter((f: any) => f.risk_rating === level).length;
                        const colors: Record<string, string> = { Critical: 'bg-red-100 text-red-800 border-red-200', High: 'bg-orange-100 text-orange-800 border-orange-200', Medium: 'bg-amber-100 text-amber-800 border-amber-200', Low: 'bg-green-100 text-green-800 border-green-200' };
                        return (
                          <div key={level} className={`rounded-lg border p-3 text-center ${colors[level] || ''}`}>
                            <p className="text-2xl font-bold">{count}</p>
                            <p className="text-xs font-medium">{level}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div>
                    <Label>Risk Narrative</Label>
                    <Textarea
                      rows={4}
                      value={reportData.risk_rating}
                      onChange={(e) => updateField('risk_rating', e.target.value)}
                      disabled={isLocked}
                      placeholder="Summarize risk distribution and severity snapshot..."
                      className="leading-relaxed text-sm"
                    />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'portfolio' && (
              <SectionCard title="Portfolio Progress" icon={BarChart3}>
                <AuditPortfolioSection engagements={engagements} departments={departments} />
              </SectionCard>
            )}

            {activeSection === 'executive_dashboard' && (
              <SectionCard title="Executive Dashboard" icon={Briefcase}>
                <AuditExecutiveDashboardSection findings={findings} actions={actions} />
              </SectionCard>
            )}

            {activeSection === 'findings' && (
              <SectionCard title={`Detailed Findings (${engagementFindings.length})`} icon={AlertTriangle}>
                {engagementFindings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No findings linked to this engagement</p>
                    <p className="text-xs mt-1">Select an engagement in Metadata to load findings</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Findings Summary Table */}
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
                          {engagementFindings.map((f: any, i: number) => (
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
                    {engagementFindings.map((f: any, i: number) => (
                      <AuditFindingCard key={f.id} finding={f} index={i + 1} responses={engagementResponses} actions={engagementActions} />
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeSection === 'responses' && (
              <SectionCard title={`Management Responses (${engagementResponses.length})`} icon={MessageSquare}>
                {engagementResponses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No management responses recorded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {engagementResponses.map((r: any, i: number) => {
                      const finding = engagementFindings.find((f: any) => f.id === r.finding_id);
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
              <SectionCard title={`Agreed Actions (${engagementActions.length})`} icon={CheckCircle2}>
                {engagementActions.length === 0 ? (
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
                        {engagementActions.map((a: any, i: number) => (
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
                  <Textarea
                    rows={5}
                    value={reportData.conclusion}
                    onChange={(e) => updateField('conclusion', e.target.value)}
                    disabled={isLocked}
                    placeholder="State the overall conclusion and follow-up expectations..."
                    className="leading-relaxed text-sm"
                  />
                  <div>
                    <Label>Follow-up Expectations</Label>
                    <Textarea
                      rows={3}
                      value={reportData.follow_up_actions}
                      onChange={(e) => updateField('follow_up_actions', e.target.value)}
                      disabled={isLocked}
                      placeholder="Define expected follow-up actions and timelines..."
                      className="leading-relaxed text-sm mt-1"
                    />
                  </div>
                </div>
              </SectionCard>
            )}

            {activeSection === 'distribution' && (
              <SectionCard title="Distribution List" icon={Mail}>
                <Textarea
                  rows={4}
                  value={reportData.distribution_list}
                  onChange={(e) => updateField('distribution_list', e.target.value)}
                  disabled={isLocked}
                  placeholder="List the recipients for this report (Name — Title — Copy Type)..."
                  className="leading-relaxed text-sm"
                />
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

        {/* Right Sidebar - Metadata/Settings */}
        <div className="w-72 border-l bg-muted/10 shrink-0 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Completeness */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completeness</p>
              <Progress value={completeness} className="h-2 mb-1" />
              <p className="text-[10px] text-muted-foreground">{completeness}% of key sections filled</p>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Report Info</p>
              <div className="space-y-2.5">
                <InfoRow label="Status"><StatusBadge status={reportData.status} /></InfoRow>
                <InfoRow label="Type"><Badge variant="outline" className="text-xs">{reportData.report_type}</Badge></InfoRow>
                <InfoRow label="Fiscal Year">{reportData.fiscal_year}</InfoRow>
                <InfoRow label="Words"><span className="text-xs tabular-nums">{wordCount}</span></InfoRow>
                {existingReport?.report_number && <InfoRow label="Report #">{existingReport.report_number}</InfoRow>}
                {existingReport?.generated_on && <InfoRow label="Created">{formatDateForDisplay(existingReport.generated_on)}</InfoRow>}
                {existingReport?.issued_at && <InfoRow label="Issued">{formatDateForDisplay(existingReport.issued_at)}</InfoRow>}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Data</p>
              <div className="space-y-2.5">
                <InfoRow label="Findings"><Badge variant="secondary">{engagementFindings.length}</Badge></InfoRow>
                <InfoRow label="Responses"><Badge variant="secondary">{engagementResponses.length}</Badge></InfoRow>
                <InfoRow label="Actions"><Badge variant="secondary">{engagementActions.length}</Badge></InfoRow>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</p>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowPreview(true)}>
                  <Eye className="h-4 w-4 mr-2" /> Preview Report
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowOverridePanel(!showOverridePanel)}>
                  <Settings2 className="h-4 w-4 mr-2" /> {showOverridePanel ? 'Hide' : 'Show'} Overrides
                  {hasReportOverrides(reportOverrides) && <Badge variant="secondary" className="ml-auto text-[9px]">Active</Badge>}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Print
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleSave} disabled={isLocked}>
                  <Save className="h-4 w-4 mr-2" /> Save Draft
                </Button>
              </div>
            </div>

            {/* Override Panel */}
            {showOverridePanel && reportTemplateConfig && (
              <>
                <Separator />
                <ReportOverridePanel
                  baseConfig={reportTemplateConfig}
                  overrides={reportOverrides}
                  onChange={setReportOverrides}
                  onReset={() => setReportOverrides(createEmptyReportOverride())}
                />
              </>
            )}

            {/* Live Preview */}
            <Separator />
            <LiveDocumentPreview
              type="report"
              baseConfig={reportTemplateConfig || DEFAULT_AUDIT_REPORT_CONFIG}
              overrides={reportOverrides}
              reportStatus={reportData.status}
            />

            {showVersions && (
              <>
                <Separator />
                <AuditReportVersionTimeline reportId={reportId} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Template Selector */}
      <AuditReportTemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        onSelect={handleTemplateSelect}
      />
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
      <span className="text-xs text-muted-foreground">{label}</span>
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
