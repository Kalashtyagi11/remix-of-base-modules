import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Printer, Download, FileText, Shield, CheckCircle2, Send } from 'lucide-react';
import { StatusBadge } from '@/components/common';
import { formatDateForDisplay } from '@/lib/format-config';
import { AuditFindingCard } from './AuditFindingCard';
import { generateAuditReportPDF } from './AuditReportPDFExport';
import { IssuedReportDistributionDialog } from './IssuedReportDistributionDialog';
import { resolveReportTemplate } from '@/lib/audit/documentTemplateResolver';
import { DEFAULT_AUDIT_REPORT_CONFIG, type AuditReportTemplateConfig, type TemplateSectionRef } from '@/lib/audit/documentTemplateDefaults';
import { mapReportOutput } from '@/lib/audit/reportOutputMapper';
import type { DocumentFoundationConfig } from '@/lib/audit/documentFoundationTypes';
import type { ResolvedPriorMatter } from '@/services/auditReportPriorMattersService';
import logo from '@/assets/ssb-logo.png';

interface AuditReportPreviewProps {
  reportData: any;
  findings: any[];
  responses: any[];
  actions: any[];
  engagement?: any;
  departmentName?: string;
  templateConfig?: AuditReportTemplateConfig;
  /** DB-driven section configuration — overrides templateConfig.sectionRefs when provided */
  dbSectionRefs?: TemplateSectionRef[];
  /** DB-loaded foundation config — uses saved org settings for branding, typography, colors */
  foundation?: DocumentFoundationConfig;
  /** Resolved prior employer matters linked to this audit visit/findings (Phase E) */
  priorMatters?: ResolvedPriorMatter[];
  onClose: () => void;
  onPrint: () => void;
}

const OPINION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Satisfactory: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
  'Needs Improvement': { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  Unsatisfactory: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300' },
  Critical: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-300' },
};

export function AuditReportPreview({
  reportData, findings, responses, actions, engagement, departmentName, templateConfig, dbSectionRefs, foundation, priorMatters = [], onClose, onPrint,
}: AuditReportPreviewProps) {
  const baseConfig = templateConfig || DEFAULT_AUDIT_REPORT_CONFIG;
  // If DB sections are provided, inject them into the config so the resolver uses them
  const config = dbSectionRefs && dbSectionRefs.length > 0
    ? { ...baseConfig, sectionRefs: dbSectionRefs, sections: dbSectionRefs }
    : baseConfig;
  // Pass foundation so resolver uses DB-saved org settings (not defaults)
  const resolved = resolveReportTemplate(config, reportData.status, foundation);
  const mapped = mapReportOutput(resolved, reportData, findings, responses, actions, departmentName, priorMatters);
  const isDraft = reportData.status === 'Draft' || reportData.status === 'In Review';
  const isFinal = reportData.status === 'Final';
  const reportDate = reportData.generated_on ? formatDateForDisplay(reportData.generated_on) : new Date().toLocaleDateString();

  // Resolve logo: use foundation's uploaded logo if available, otherwise fallback to bundled asset
  const resolvedLogoSrc = resolved.branding.logoSource && resolved.branding.logoSource !== 'default'
    ? resolved.branding.logoSource
    : logo;

  // Resolve colors from foundation
  const primaryColor = foundation?.colorPalette?.primary || '#0E5F3A';
  const goldColor = foundation?.colorPalette?.gold || '#F4C430';

  const pdfParams = { reportData, findings, responses, actions, engagement, departmentName, templateConfig: config, dbSectionRefs, foundation, priorMatters };

  const handleExportPDF = () => {
    generateAuditReportPDF(pdfParams);
  };

  // Formal distribution is only available once the report has been issued.
  const isIssued = reportData.status === 'Issued' || reportData.status === 'Final';
  const [distributeOpen, setDistributeOpen] = React.useState(false);

  /** Produces the exact issued bytes for governed sealing. Never downloaded. */
  const buildIssuedPdf = async () => {
    const out = generateAuditReportPDF({ ...pdfParams, output: 'blob' }) as
      | { blob: Blob; fileName: string }
      | undefined;
    return out ?? null;
  };

  // Section numbering — driven by mapped output
  let sectionNum = 0;
  const nextSection = () => ++sectionNum;

  // Build section renderers keyed by ID
  const sectionRenderers: Record<string, () => React.ReactNode> = {
    executive_summary: () => reportData.executive_summary ? (
      <div key="executive_summary">
        <SectionHeading number={nextSection()}>Executive Summary</SectionHeading>
        {reportData.overall_assessment && (
          <div className="mb-4"><OpinionIndicator opinion={reportData.overall_assessment} /></div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.executive_summary}</p>
      </div>
    ) : null,

    background: () => reportData.background ? (
      <div key="background">
        <SectionHeading number={nextSection()}>Audit Background</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.background}</p>
      </div>
    ) : null,

    objective: () => reportData.audit_objective ? (
      <div key="objective">
        <SectionHeading number={nextSection()}>Audit Objective</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.audit_objective}</p>
      </div>
    ) : null,

    scope: () => reportData.audit_scope ? (
      <div key="scope">
        <SectionHeading number={nextSection()}>Scope</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.audit_scope}</p>
      </div>
    ) : null,

    methodology: () => reportData.methodology ? (
      <div key="methodology">
        <SectionHeading number={nextSection()}>Methodology</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.methodology}</p>
      </div>
    ) : null,

    risk_overview: () => (reportData.risk_rating || findings.length > 0) ? (
      <div key="risk_overview">
        <SectionHeading number={nextSection()}>Risk Overview</SectionHeading>
        {findings.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {['Critical', 'High', 'Medium', 'Low'].map((level) => {
              const count = findings.filter((f: any) => f.risk_rating === level).length;
              const colors: Record<string, string> = {
                Critical: 'border-red-300 bg-red-50 text-red-800 print:bg-white print:text-red-700',
                High: 'border-orange-300 bg-orange-50 text-orange-800 print:bg-white print:text-orange-700',
                Medium: 'border-amber-300 bg-amber-50 text-amber-800 print:bg-white print:text-amber-700',
                Low: 'border-green-300 bg-green-50 text-green-800 print:bg-white print:text-green-700',
              };
              return (
                <div key={level} className={`rounded-lg border-2 p-3 text-center ${colors[level]}`}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs font-semibold">{level}</p>
                </div>
              );
            })}
          </div>
        )}
        {reportData.risk_rating && <p className="text-sm leading-relaxed">{reportData.risk_rating}</p>}
      </div>
    ) : null,

    key_findings: () => findings.length > 0 ? (
      <div key="key_findings">
        <SectionHeading number={nextSection()}>Key Findings Snapshot</SectionHeading>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0E5F3A] text-white text-xs">
                <th className="text-left p-2.5 font-medium">#</th>
                <th className="text-left p-2.5 font-medium">Finding</th>
                <th className="text-left p-2.5 font-medium">Risk Rating</th>
                <th className="text-left p-2.5 font-medium">Impact Area</th>
                <th className="text-left p-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f: any, i: number) => (
                <tr key={f.id} className={`border-t ${i % 2 === 1 ? 'bg-muted/20 print:bg-gray-50' : ''}`}>
                  <td className="p-2.5 font-bold">{i + 1}</td>
                  <td className="p-2.5 font-medium">{f.title || 'Untitled'}</td>
                  <td className="p-2.5"><Badge variant="outline" className="text-xs">{f.risk_rating || '—'}</Badge></td>
                  <td className="p-2.5 text-xs">{f.impact_area || '—'}</td>
                  <td className="p-2.5"><StatusBadge status={f.status || 'Open'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null,

    detailed_findings: () => findings.length > 0 ? (
      <div key="detailed_findings">
        <SectionHeading number={nextSection()}>Detailed Findings</SectionHeading>
        <div className="space-y-5">
          {findings.map((f: any, i: number) => {
            const findingResponses = mapped.showInlineManagementResponse
              ? responses.filter((r: any) => r.finding_id === f.id)
              : [];
            return (
              <div key={f.id}>
                <AuditFindingCard finding={f} index={i + 1} responses={mapped.showInlineManagementResponse ? findingResponses : []} actions={actions} />
                {mapped.showInlineManagementResponse && findingResponses.length > 0 && (
                  <div className="ml-4 mt-2 space-y-2">
                    {findingResponses.map((r: any) => (
                      <div key={r.id} className="border-l-4 border-l-blue-400 pl-4 py-2 print:border-l-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Management Response</p>
                        <p className="text-sm leading-relaxed mt-1">{r.response_text || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ) : null,

    management_responses: () => responses.length > 0 ? (
      <div key="management_responses">
        <SectionHeading number={nextSection()}>Management Responses</SectionHeading>
        <div className="space-y-3">
          {responses.map((r: any, i: number) => {
            const finding = findings.find((f: any) => f.id === r.finding_id);
            return (
              <div key={r.id} className="border-l-4 border-l-blue-400 pl-4 py-3 print:border-l-2">
                <p className="text-sm font-semibold">{finding?.title || `Response ${i + 1}`}</p>
                <p className="text-sm leading-relaxed mt-1">{r.response_text || '—'}</p>
              </div>
            );
          })}
        </div>
      </div>
    ) : null,

    action_plan: () => actions.length > 0 ? (
      <div key="action_plan">
        <SectionHeading number={nextSection()}>Agreed Action Plan</SectionHeading>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0E5F3A] text-white text-xs">
                <th className="text-left p-2.5 font-medium">#</th>
                {mapped.actionPlanColumnKeys.includes('finding') && <th className="text-left p-2.5 font-medium">Finding</th>}
                {mapped.actionPlanColumnKeys.includes('action') && <th className="text-left p-2.5 font-medium">Action</th>}
                {mapped.actionPlanColumnKeys.includes('owner') && <th className="text-left p-2.5 font-medium">Owner</th>}
                {mapped.actionPlanColumnKeys.includes('due_date') && <th className="text-left p-2.5 font-medium">Due Date</th>}
                {mapped.actionPlanColumnKeys.includes('status') && <th className="text-left p-2.5 font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {actions.map((a: any, i: number) => {
                const finding = findings.find((f: any) => f.id === a.finding_id);
                return (
                  <tr key={a.id} className={`border-t ${i % 2 === 1 ? 'bg-muted/20 print:bg-gray-50' : ''}`}>
                    <td className="p-2.5 font-medium">{i + 1}</td>
                    {mapped.actionPlanColumnKeys.includes('finding') && <td className="p-2.5">{finding?.title || '—'}</td>}
                    {mapped.actionPlanColumnKeys.includes('action') && <td className="p-2.5">{a.action_description || '—'}</td>}
                    {mapped.actionPlanColumnKeys.includes('owner') && <td className="p-2.5">{a.responsible_person || '—'}</td>}
                    {mapped.actionPlanColumnKeys.includes('due_date') && <td className="p-2.5">{a.target_date ? formatDateForDisplay(a.target_date) : '—'}</td>}
                    {mapped.actionPlanColumnKeys.includes('status') && <td className="p-2.5"><StatusBadge status={a.status || 'Open'} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : null,

    conclusion: () => (reportData.conclusion || reportData.follow_up_actions) ? (
      <div key="conclusion">
        <SectionHeading number={nextSection()}>Conclusion</SectionHeading>
        {reportData.conclusion && <p className="text-sm leading-relaxed whitespace-pre-wrap mb-4">{reportData.conclusion}</p>}
        {reportData.follow_up_actions && (
          <div className="rounded-lg border bg-muted/20 p-4 print:bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Follow-up Expectations</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.follow_up_actions}</p>
          </div>
        )}
      </div>
    ) : null,

    distribution: () => reportData.distribution_list ? (
      <div key="distribution">
        <SectionHeading number={nextSection()}>Distribution</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{reportData.distribution_list}</p>
      </div>
    ) : null,

    approval: () => (
      <div key="approval">
        <SectionHeading number={nextSection()}>Approval & Sign-off</SectionHeading>
        <div className="grid gap-12 mt-8">
          {resolved.signatories.map((sig) => {
            const name = sig.label === 'Prepared By' ? (reportData.prepared_by || sig.defaultName) :
                         sig.label === 'Reviewed By' ? (reportData.reviewed_by || sig.defaultName) :
                         sig.label === 'Approved By' ? (reportData.approved_by || sig.defaultName || 'Director') :
                         sig.defaultName;
            return (
              <div key={sig.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{sig.label}</p>
                <div className="mt-8 border-t border-foreground/40 w-72" />
                <p className="text-sm font-semibold mt-2">{name || '—'}</p>
                <p className="text-xs text-muted-foreground">{sig.roleTitle}</p>
                <p className="text-xs text-muted-foreground mt-1">Date: _______________</p>
              </div>
            );
          })}
        </div>
      </div>
    ),

    prior_compliance_history: () => priorMatters.length > 0 ? (
      <div key="prior_compliance_history">
        <SectionHeading number={nextSection()}>Prior Compliance History</SectionHeading>
        <p className="text-xs text-muted-foreground mb-3">
          Previously recorded employer matters linked by the auditor as relevant context for this audit.
        </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs">
                <th className="text-left p-2.5 font-medium">#</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Reference</th>
                <th className="text-left p-2.5 font-medium">Details</th>
                <th className="text-left p-2.5 font-medium">Scope</th>
                <th className="text-left p-2.5 font-medium">Relevance</th>
              </tr>
            </thead>
            <tbody>
              {priorMatters.map((m, i) => (
                <tr key={m.link.id} className={`border-t ${i % 2 === 1 ? 'bg-muted/20 print:bg-gray-50' : ''}`}>
                  <td className="p-2.5 font-medium align-top">{i + 1}</td>
                  <td className="p-2.5 align-top">{m.matterType.replace(/_/g, ' ')}</td>
                  <td className="p-2.5 align-top font-medium">{m.primaryLabel}</td>
                  <td className="p-2.5 align-top">{m.detailLine || '—'}</td>
                  <td className="p-2.5 align-top capitalize">{m.scope}</td>
                  <td className="p-2.5 align-top text-muted-foreground">{m.relevanceNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null,
  };

  // Build TOC from sections marked includeInToc (not all ordered sections)
  const tocItems = mapped.tocSections.map((id, i) => {
    const section = resolved.sections.find((s) => s.id === id);
    return `${i + 1}. ${section?.label || id}`;
  });

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      {isIssued && reportData.id && (
        <IssuedReportDistributionDialog
          open={distributeOpen}
          onOpenChange={setDistributeOpen}
          reportId={reportData.id}
          reportNumber={reportData.report_number}
          reportTitle={reportData.title}
          engagementTitle={engagement?.title ?? engagement?.engagement_title ?? null}
          overallOpinion={reportData.overall_assessment}
          issuedOn={reportData.issued_at ?? reportData.generated_on ?? null}
          buildPdf={buildIssuedPdf}
        />
      )}
      {/* Fixed Top Bar */}
      <div className="sticky top-0 z-50 bg-background border-b px-4 py-2.5 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Editor
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm font-medium">Report Preview</span>
          {isDraft && <Badge variant="outline" className="text-amber-600 border-amber-300">DRAFT</Badge>}
          {isFinal && <Badge className="bg-emerald-600 text-white">ISSUED</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          {isIssued && reportData.id && (
            <Button size="sm" onClick={() => setDistributeOpen(true)}>
              <Send className="h-4 w-4 mr-1" /> Distribute Report
            </Button>
          )}
        </div>
      </div>

      {/* Report Document */}
      <div className="max-w-[850px] mx-auto my-8 print:my-0 print:max-w-none">
        {/* ─── COVER PAGE ─── */}
        <div className="bg-white dark:bg-background shadow-lg print:shadow-none rounded-lg print:rounded-none overflow-hidden relative min-h-[900px] flex flex-col">
          {/* Draft Watermark */}
          {resolved.showWatermark && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <p className="text-[100px] font-bold text-gray-300/[0.12] -rotate-45 select-none tracking-widest">{resolved.watermarkText}</p>
            </div>
          )}

          {/* Issued Stamp */}
          {resolved.showIssuedStamp && (
            <div className="absolute top-16 right-8 z-10 pointer-events-none">
              <div className="border-4 border-emerald-600 rounded-lg px-5 py-2 rotate-12 opacity-60">
                <p className="text-emerald-600 font-bold text-lg tracking-wider">ISSUED</p>
                <p className="text-emerald-600 text-[10px] text-center">{reportData.issued_at ? formatDateForDisplay(reportData.issued_at) : reportDate}</p>
              </div>
            </div>
          )}

          <div className="relative z-20 flex-1 flex flex-col">
            {/* Header Band — uses Foundation primary color */}
            <div style={{ backgroundColor: primaryColor }} className="text-white px-12 py-6">
              <div className="flex items-center justify-between">
                <div>
                  {resolved.branding.showLogo && (
                    <img src={resolvedLogoSrc} alt="Logo" className="h-14 mb-2 object-contain max-w-[200px]" />
                  )}
                  <h1 className="text-lg font-bold tracking-wide">{resolved.branding.orgName}</h1>
                  <p className="text-sm opacity-80">{resolved.branding.country}</p>
                </div>
                <div className="text-right text-xs opacity-70">
                  <p>{resolved.branding.address}</p>
                  <p>Tel: {resolved.branding.phone}</p>
                </div>
              </div>
            </div>
            {/* Gold Accent — uses Foundation gold color */}
            <div style={{ backgroundColor: goldColor }} className="h-1" />

            {/* Cover Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Internal Audit Department</p>
              <h2 className="text-3xl font-bold text-foreground leading-tight mb-4">{reportData.title || resolved.coverPage.reportTitle}</h2>
              
              <div className="flex items-center gap-3 mb-8">
                {resolved.coverPage.showSubtitle && reportData.report_type && (
                  <Badge variant="outline" className="text-sm px-3 py-1">{reportData.report_type || resolved.coverPage.subtitleText}</Badge>
                )}
              </div>

              {/* Cover metadata in configured order */}
              <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm mt-4 max-w-md">
                {mapped.coverMetadata.map((meta) => (
                  <CoverMeta key={meta.label} label={meta.label} value={meta.value} />
                ))}
              </div>
            </div>

            {/* Confidentiality Notice */}
            <div className="border-t px-12 py-5 bg-muted/30 print:bg-gray-50">
              <p className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider mb-1">Confidential</p>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed max-w-lg mx-auto">
                {resolved.coverPage.confidentialityText}
              </p>
            </div>
          </div>
        </div>

        {/* ─── PAGE BREAK ─── */}
        <PageBreak />

        {/* ─── TABLE OF CONTENTS ─── */}
        <ReportPage isDraft={isDraft} watermarkText={resolved.showWatermark ? resolved.watermarkText : undefined}>
          <SectionHeading>Table of Contents</SectionHeading>
          <div className="space-y-1.5 text-sm">
            {tocItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-dotted border-muted-foreground/20">
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </ReportPage>

        <PageBreak />

        {/* ─── REPORT BODY — Sections rendered in configured order ─── */}
        <ReportPage isDraft={isDraft} watermarkText={resolved.showWatermark ? resolved.watermarkText : undefined}>
          <div className="space-y-10">
            {mapped.orderedSections.map((sectionId) => {
              const renderer = sectionRenderers[sectionId];
              return renderer ? renderer() : null;
            })}
          </div>

          {/* Page Footer */}
          <div className="pt-10 border-t mt-10 text-center space-y-1 print:mt-0">
            <div className="h-0.5 bg-[#0E5F3A] mb-3" />
            <p className="text-[10px] text-muted-foreground">{resolved.branding.orgName} · {resolved.branding.address}</p>
            <p className="text-[10px] text-muted-foreground">Internal Audit Department</p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">CONFIDENTIAL — For Authorized Recipients Only</p>
            {reportData.report_number && (
              <p className="text-[10px] text-muted-foreground">Ref: {reportData.report_number}</p>
            )}
          </div>
        </ReportPage>
      </div>
    </div>
  );
}

// ─── Helper Components ───

function ReportPage({ children, isDraft, watermarkText }: { children: React.ReactNode; isDraft: boolean; watermarkText?: string }) {
  return (
    <div className="bg-white dark:bg-background shadow-lg print:shadow-none rounded-lg print:rounded-none overflow-hidden relative">
      {isDraft && watermarkText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <p className="text-[100px] font-bold text-gray-300/[0.12] -rotate-45 select-none tracking-widest">{watermarkText}</p>
        </div>
      )}
      <div className="relative z-20 p-12 print:p-8">{children}</div>
    </div>
  );
}

function PageBreak() {
  return (
    <div className="h-4 print:h-0 print:break-after-page" />
  );
}

function SectionHeading({ children, number }: { children: React.ReactNode; number?: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-2">
        {number !== undefined && (
          <span className="text-xs font-bold text-white bg-[#0E5F3A] rounded-full h-6 w-6 flex items-center justify-center shrink-0">{number}</span>
        )}
        <h3 className="text-lg font-bold text-[#0E5F3A]">{children}</h3>
      </div>
      <div className="h-0.5 bg-[#0E5F3A]/20" />
    </div>
  );
}

function CoverMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}

function OpinionIndicator({ opinion }: { opinion: string }) {
  const style = OPINION_STYLES[opinion];
  if (!style) return null;
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border-2 ${style.border} ${style.bg} px-4 py-2 print:bg-white`}>
      <CheckCircle2 className={`h-4 w-4 ${style.text}`} />
      <span className={`text-sm font-bold ${style.text}`}>Overall Assessment: {opinion}</span>
    </div>
  );
}
