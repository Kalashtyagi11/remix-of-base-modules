/**
 * Enterprise-grade PDF export for Internal Audit reports.
 * Uses the unified auditExportPrimitives for consistent branding.
 * Settings-driven via documentTemplateResolver + reportOutputMapper.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_AUDIT_BRANDING,
  brandingFromReportConfig,
  renderCoverPage,
  renderFooter,
  renderSectionHeading,
  renderParagraph,
  renderWatermark,
  renderApprovalBlock,
  getAuditTableConfig,
  type ExportBranding,
} from '@/lib/audit/auditExportPrimitives';
import { formatDateForDisplay } from '@/lib/format-config';
import { resolveReportTemplate } from '@/lib/audit/documentTemplateResolver';
import { DEFAULT_AUDIT_REPORT_CONFIG, type AuditReportTemplateConfig, type TemplateSectionRef } from '@/lib/audit/documentTemplateDefaults';
import { mapReportOutput } from '@/lib/audit/reportOutputMapper';
import type { DocumentFoundationConfig } from '@/lib/audit/documentFoundationTypes';
import type { ResolvedPriorMatter } from '@/services/auditReportPriorMattersService';

interface PDFExportParams {
  reportData: any;
  findings: any[];
  responses: any[];
  actions: any[];
  engagement?: any;
  departmentName?: string;
  templateConfig?: AuditReportTemplateConfig;
  /** DB-driven section configuration */
  dbSectionRefs?: TemplateSectionRef[];
  /** DB-loaded foundation config */
  foundation?: DocumentFoundationConfig;
  /** Resolved prior employer matters for the "Prior Compliance History" section (Phase E) */
  priorMatters?: ResolvedPriorMatter[];
  /**
   * `save` (default) downloads the file in the browser.
   * `blob` returns the exact bytes so they can be sealed as a governed
   * Internal Audit document artifact instead of being handed to the user.
   */
  output?: 'save' | 'blob';
}

export interface AuditReportPdfBytes {
  blob: Blob;
  fileName: string;
}

export function generateAuditReportPDF({
  reportData, findings, responses, actions, engagement, departmentName, templateConfig, dbSectionRefs, foundation, priorMatters = [], output = 'save',
}: PDFExportParams): AuditReportPdfBytes | void {
  const baseConfig = templateConfig || DEFAULT_AUDIT_REPORT_CONFIG;
  // If DB sections are provided, inject them into the config
  const config = dbSectionRefs && dbSectionRefs.length > 0
    ? { ...baseConfig, sectionRefs: dbSectionRefs, sections: dbSectionRefs }
    : baseConfig;
  // Pass foundation so resolver uses DB-saved org settings
  const resolved = resolveReportTemplate(config, reportData.status, foundation);
  const mapped = mapReportOutput(resolved, reportData, findings, responses, actions, departmentName, priorMatters);
  const doc = new jsPDF({ orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pw - margin * 2;

  // Build branding from template config
  const branding: ExportBranding = brandingFromReportConfig(resolved.branding);

  // ─── COVER PAGE ───
  const reportDate = reportData.generated_on
    ? formatDateForDisplay(reportData.generated_on)
    : new Date().toLocaleDateString();

  renderCoverPage(doc, branding, {
    title: reportData.title || resolved.coverPage.reportTitle,
    subtitle: resolved.coverPage.showSubtitle
      ? (reportData.report_type || resolved.coverPage.subtitleText)
      : undefined,
    metadata: mapped.coverMetadata,
    showConfidentiality: true,
  });

  // Draft watermark on cover
  if (resolved.showWatermark) renderWatermark(doc, resolved.watermarkText);

  // ─── CONTENT PAGES ───
  doc.addPage();
  let y = 20;

  // ─── Section renderers keyed by ID ───
  let sn = 0;

  const addSectionHeader = (title: string) => {
    y = renderSectionHeading(doc, branding, title, y, { sectionNumber: ++sn });
  };

  const addParagraphText = (text: string) => {
    y = renderParagraph(doc, branding, text, y, { margin, watermarkText: resolved.showWatermark ? resolved.watermarkText : undefined });
  };

  const pdfSectionRenderers: Record<string, () => void> = {
    executive_summary: () => {
      if (!reportData.executive_summary) return;
      addSectionHeader('Executive Summary');
      if (reportData.overall_assessment) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...branding.primaryColor);
        doc.text(`Overall Assessment: ${reportData.overall_assessment}`, margin, y);
        y += 8;
      }
      addParagraphText(reportData.executive_summary);
    },
    background: () => {
      if (!reportData.background) return;
      addSectionHeader('Audit Background');
      addParagraphText(reportData.background);
    },
    objective: () => {
      if (!reportData.audit_objective) return;
      addSectionHeader('Audit Objective');
      addParagraphText(reportData.audit_objective);
    },
    scope: () => {
      if (!reportData.audit_scope) return;
      addSectionHeader('Scope');
      addParagraphText(reportData.audit_scope);
    },
    methodology: () => {
      if (!reportData.methodology) return;
      addSectionHeader('Methodology');
      addParagraphText(reportData.methodology);
    },
    risk_overview: () => {
      if (!(reportData.risk_rating || findings.length > 0)) return;
      addSectionHeader('Risk Overview');
      if (findings.length > 0) {
        const riskData = ['Critical', 'High', 'Medium', 'Low'].map((level) => {
          const count = findings.filter((f: any) => f.risk_rating === level).length;
          return [level, String(count)];
        });
        autoTable(doc, {
          startY: y,
          head: [['Risk Level', 'Count']],
          body: riskData,
          ...getAuditTableConfig(branding, y, { fontSize: 8 }),
          tableWidth: 80,
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
      if (reportData.risk_rating) addParagraphText(reportData.risk_rating);
    },
    key_findings: () => {
      if (findings.length === 0) return;
      addSectionHeader('Key Findings Snapshot');
      autoTable(doc, {
        startY: y,
        head: [['#', 'Finding', 'Risk', 'Status']],
        body: findings.map((f: any, i: number) => [
          String(i + 1), f.title || 'Untitled', f.risk_rating || '—', f.status || 'Open',
        ]),
        ...getAuditTableConfig(branding, y),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    },
    detailed_findings: () => {
      if (findings.length === 0) return;
      addSectionHeader('Detailed Findings');
      findings.forEach((f: any, i: number) => {
        if (y > ph - 60) { doc.addPage(); y = 20; if (resolved.showWatermark) renderWatermark(doc, resolved.watermarkText); }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...branding.primaryColor);
        doc.text(`Finding ${i + 1}: ${f.title || 'Untitled'}`, margin, y);
        y += 6;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...branding.mutedText);
        doc.text(`Risk: ${f.risk_rating || '—'} | Impact: ${f.impact_area || '—'} | Status: ${f.status || 'Open'}`, margin, y);
        y += 6;

        const obs = [
          ['Criteria', f.criteria],
          ['Condition', f.condition],
          ['Cause', f.cause],
          ['Effect', f.effect],
          ['Recommendation', f.recommendation],
        ].filter(([, v]) => v);

        if (obs.length > 0) {
          autoTable(doc, {
            startY: y,
            body: obs.map(([label, val]) => [label, val]),
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
            margin: { left: margin, right: margin },
          });
          y = (doc as any).lastAutoTable.finalY + 4;
        }

        // Inline management response
        if (mapped.showInlineManagementResponse) {
          const findingResponses = responses.filter((r: any) => r.finding_id === f.id);
          findingResponses.forEach((r: any) => {
            if (y > ph - 30) { doc.addPage(); y = 20; if (resolved.showWatermark) renderWatermark(doc, resolved.watermarkText); }
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...branding.mutedText);
            doc.text('Management Response:', margin + 4, y);
            y += 5;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...branding.darkText);
            const respLines = doc.splitTextToSize(r.response_text || '—', contentWidth - 8);
            respLines.forEach((line: string) => {
              if (y > ph - 25) { doc.addPage(); y = 20; }
              doc.text(line, margin + 4, y);
              y += 5;
            });
            y += 2;
          });
        }
        y += 2;
      });
    },
    management_responses: () => {
      if (responses.length === 0) return;
      addSectionHeader('Management Responses');
      responses.forEach((r: any, i: number) => {
        if (y > ph - 30) { doc.addPage(); y = 20; if (resolved.showWatermark) renderWatermark(doc, resolved.watermarkText); }
        const finding = findings.find((f: any) => f.id === r.finding_id);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...branding.darkText);
        doc.text(finding?.title || `Response ${i + 1}`, margin, y);
        y += 5;
        addParagraphText(r.response_text || '—');
      });
    },
    action_plan: () => {
      if (actions.length === 0) return;
      addSectionHeader('Agreed Action Plan');

      const colKeys = mapped.actionPlanColumnKeys;
      const headerLabels = ['#'];
      colKeys.forEach((k) => {
        const col = resolved.actionPlanColumns.find((c) => c.key === k);
        headerLabels.push(col?.label || k);
      });

      const body = actions.map((a: any, i: number) => {
        const finding = findings.find((f: any) => f.id === a.finding_id);
        const row = [String(i + 1)];
        colKeys.forEach((k) => {
          switch (k) {
            case 'finding': row.push(finding?.title || '—'); break;
            case 'action': row.push(a.action_description || '—'); break;
            case 'owner': row.push(a.responsible_person || '—'); break;
            case 'due_date': row.push(a.target_date ? formatDateForDisplay(a.target_date) : '—'); break;
            case 'status': row.push(a.status || 'Open'); break;
            default: row.push('—');
          }
        });
        return row;
      });

      autoTable(doc, {
        startY: y,
        head: [headerLabels],
        body,
        ...getAuditTableConfig(branding, y, { fontSize: 7, cellPadding: 2.5 }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    },
    conclusion: () => {
      if (reportData.conclusion) {
        addSectionHeader('Conclusion');
        addParagraphText(reportData.conclusion);
      }
      if (reportData.follow_up_actions) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...branding.mutedText);
        if (y > ph - 30) { doc.addPage(); y = 20; }
        doc.text('Follow-up Expectations:', margin, y);
        y += 5;
        addParagraphText(reportData.follow_up_actions);
      }
    },
    distribution: () => {
      if (!reportData.distribution_list) return;
      addSectionHeader('Distribution');
      addParagraphText(reportData.distribution_list);
    },
    approval: () => {
      addSectionHeader('Approval & Sign-off');
      const signatories = resolved.signatories.map((sig) => ({
        label: sig.label,
        name: sig.label === 'Prepared By' ? (reportData.prepared_by || sig.defaultName) :
              sig.label === 'Reviewed By' ? (reportData.reviewed_by || sig.defaultName) :
              sig.label === 'Approved By' ? (reportData.approved_by || sig.defaultName || 'Director') :
              sig.defaultName,
        roleTitle: sig.roleTitle,
      }));
      y = renderApprovalBlock(doc, branding, signatories, y);
    },
    prior_compliance_history: () => {
      if (priorMatters.length === 0) return;
      addSectionHeader('Prior Compliance History');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...branding.mutedText);
      const intro = 'Previously recorded employer matters linked by the auditor as relevant context for this audit.';
      const introLines = doc.splitTextToSize(intro, contentWidth);
      introLines.forEach((line: string) => { doc.text(line, margin, y); y += 4; });
      y += 2;
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: y,
        head: [['#', 'Type', 'Reference', 'Details', 'Scope', 'Relevance']],
        body: priorMatters.map((m, i) => [
          String(i + 1),
          m.matterType.replace(/_/g, ' '),
          m.primaryLabel,
          m.detailLine || '—',
          m.scope,
          m.relevanceNote || '—',
        ]),
        ...getAuditTableConfig(branding, y, { fontSize: 7, cellPadding: 2.5 }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    },
  };

  // Render sections in configured order
  mapped.orderedSections.forEach((sectionId) => {
    const renderer = pdfSectionRenderers[sectionId];
    if (renderer) renderer();
  });

  // Footer on all pages
  renderFooter(doc, branding);

  // Save
  const fileName = `${(reportData.report_number || reportData.title || 'Audit-Report').replace(/[^a-zA-Z0-9]/g, '-')}-${reportData.status || 'Draft'}`;
  if (output === 'blob') {
    return { blob: doc.output('blob') as Blob, fileName: `${fileName}.pdf` };
  }
  doc.save(`${fileName}.pdf`);
}
