/**
 * INTERNAL AUDIT — Issued final report: sealing and governed distribution.
 *
 * The report record (IA-RPT-SKN-…) is the authoritative business object.
 * The PDF is a SUBORDINATE, versioned artifact of that record:
 *
 *   report issued → PDF rendered once → uploaded to private `ia-artifacts`
 *                 → SHA-256 → ia_register_document_artifact(seal = true)
 *                 → omni_comms_register_attachment (governed registry)
 *                 → emitInternalAuditCommunication(INTERNAL_AUDIT.REPORT.ISSUED)
 *
 * Distribution is a SEPARATE lifecycle from issuance: re-distributing never
 * re-renders or re-seals; the same sealed bytes are reused. Internal Audit
 * supplies facts and a governed attachment id only — never bytes, subject,
 * sender, template, provider or channel.
 */
import { supabase } from '@/integrations/supabase/client';
import { resolveBusinessCommunicationScope } from '@/platform/omni-comms/integrations/business/businessScopeResolver';
import { emitInternalAuditCommunication } from '@/platform/omni-comms/integrations/business/internal-audit/internalAuditCommunicationProducer';
import { INTERNAL_AUDIT_MODULE_CODE } from '@/platform/omni-comms/integrations/business/internal-audit/internalAuditCommunicationCatalogue';
import { sha256Hex } from './planDistributionCommunicationService';

export const IA_REPORT_ISSUED_EVENT = 'INTERNAL_AUDIT.REPORT.ISSUED';
export const IA_ARTIFACT_BUCKET = 'ia-artifacts';
export const IA_REPORT_ARTIFACT_TYPE = 'final_audit_report';
export const IA_REPORT_ARTIFACT_ENTITY = 'ia_audit_report';

export interface SealedReportArtifact {
  ok: boolean;
  artifactId: string | null;
  attachmentId: string | null;
  versionNumber: number | null;
  checksum: string | null;
  byteSize: number | null;
  fileName: string;
  storagePath: string | null;
  reused: boolean;
  /** Bounded failure code. Never a raw storage or provider message. */
  code: string | null;
}

const EMPTY = (fileName: string): SealedReportArtifact => ({
  ok: false,
  artifactId: null,
  attachmentId: null,
  versionNumber: null,
  checksum: null,
  byteSize: null,
  fileName,
  storagePath: null,
  reused: false,
  code: null,
});

function safeFileName(name: string): string {
  return (name || 'Internal-Audit-Report.pdf')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

/** The sealed artifact already registered for this report, if any. */
export async function getSealedReportArtifact(
  reportId: string,
): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from('ia_document_artifact')
    .select('*')
    .eq('source_entity_type', IA_REPORT_ARTIFACT_ENTITY)
    .eq('source_entity_id', reportId)
    .eq('artifact_type', IA_REPORT_ARTIFACT_TYPE)
    .eq('status', 'Sealed')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, any>) ?? null;
}

async function registerGovernedAttachment(
  artifactId: string,
  storagePath: string,
  fileName: string,
  byteSize: number,
  checksum: string,
): Promise<{ attachmentId: string | null; code: string | null }> {
  const scope = await resolveBusinessCommunicationScope({
    moduleCode: INTERNAL_AUDIT_MODULE_CODE,
  });
  if (!scope.organizationId) return { attachmentId: null, code: 'organization_unresolved' };

  const { data, error } = await supabase.rpc('omni_comms_register_attachment', {
    p_organization_id: scope.organizationId,
    p_owner_module_code: INTERNAL_AUDIT_MODULE_CODE,
    p_source_entity_type: 'ia_document_artifact',
    p_source_entity_id: artifactId,
    p_storage_bucket: IA_ARTIFACT_BUCKET,
    p_storage_path: storagePath,
    p_file_name: fileName,
    p_content_type: 'application/pdf',
    p_byte_size: byteSize,
    p_checksum_sha256: checksum,
    p_classification: 'confidential',
    p_department_id: scope.departmentId,
  } as never);

  if (error) return { attachmentId: null, code: 'attachment_registration_failed' };
  const row = (data ?? {}) as { ok?: boolean; attachment_id?: string; code?: string };
  if (!row.ok || !row.attachment_id) {
    return { attachmentId: null, code: row.code ?? 'attachment_registration_failed' };
  }
  return { attachmentId: row.attachment_id, code: null };
}

/**
 * Seal the exact issued report PDF once, or return the existing seal.
 * Passing `blob` is only required the first time.
 */
export async function sealIssuedReportArtifact(input: {
  reportId: string;
  reportNumber?: string | null;
  blob?: Blob | null;
  fileName?: string | null;
}): Promise<SealedReportArtifact> {
  const fileName = safeFileName(
    input.fileName || `${input.reportNumber || 'Internal-Audit-Report'}.pdf`,
  );
  const base = EMPTY(fileName);

  // 1. Reuse an existing seal — issued bytes are sealed exactly once.
  const existing = await getSealedReportArtifact(input.reportId);
  if (existing) {
    const reg = await registerGovernedAttachment(
      existing.id,
      existing.storage_path,
      existing.file_name,
      Number(existing.byte_size),
      existing.checksum_sha256,
    );
    return {
      ...base,
      ok: !!reg.attachmentId,
      artifactId: existing.id,
      attachmentId: reg.attachmentId,
      versionNumber: existing.version_number,
      checksum: existing.checksum_sha256,
      byteSize: Number(existing.byte_size),
      fileName: existing.file_name,
      storagePath: existing.storage_path,
      reused: true,
      code: reg.code,
    };
  }

  if (!input.blob || input.blob.size === 0) {
    return { ...base, code: 'artifact_bytes_unavailable' };
  }

  const bytes = await input.blob.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  const storagePath = `reports/${input.reportId}/${checksum.slice(0, 12)}-${fileName}`;

  const upload = await supabase.storage
    .from(IA_ARTIFACT_BUCKET)
    .upload(storagePath, input.blob, { contentType: 'application/pdf', upsert: true });
  if (upload.error) return { ...base, checksum, code: 'artifact_upload_failed' };

  const { data, error } = await supabase.rpc('ia_register_document_artifact', {
    p_source_entity_type: IA_REPORT_ARTIFACT_ENTITY,
    p_source_entity_id: input.reportId,
    p_artifact_type: IA_REPORT_ARTIFACT_TYPE,
    p_file_name: fileName,
    p_storage_path: storagePath,
    p_byte_size: bytes.byteLength,
    p_checksum_sha256: checksum,
    p_seal: true,
    p_mime_type: 'application/pdf',
    p_classification: 'confidential',
  } as never);

  if (error) return { ...base, checksum, code: 'artifact_registration_failed' };
  const row = (data ?? {}) as {
    ok?: boolean; artifact_id?: string; version_number?: number; code?: string;
  };
  if (!row.ok || !row.artifact_id) {
    return { ...base, checksum, code: row.code ?? 'artifact_registration_failed' };
  }

  const reg = await registerGovernedAttachment(
    row.artifact_id, storagePath, fileName, bytes.byteLength, checksum,
  );

  return {
    ok: !!reg.attachmentId,
    artifactId: row.artifact_id,
    attachmentId: reg.attachmentId,
    versionNumber: row.version_number ?? 1,
    checksum,
    byteSize: bytes.byteLength,
    fileName,
    storagePath,
    reused: false,
    code: reg.code,
  };
}

export interface ReportRecipientInput {
  name: string;
  email?: string | null;
  userId?: string | null;
  /** Business role label, for evidence only. */
  role?: string | null;
}

export interface ReportDistributionRecipientResult {
  recipient: ReportRecipientInput;
  outcome: 'queued' | 'sent' | 'skipped' | 'blocked' | 'failed';
  requestId: string | null;
  blockers: string[];
}

export interface ReportDistributionResult {
  artifact: SealedReportArtifact;
  results: ReportDistributionRecipientResult[];
  acceptedCount: number;
  blockedCount: number;
}

/**
 * Distribute the sealed issued report.
 *
 * The document is MANDATORY on every channel that can carry a file, and
 * scoped so that in-app / notification channels stay deliverable with a
 * governed deep link instead of a physical enclosure.
 */
export async function distributeIssuedAuditReport(input: {
  reportId: string;
  reportNumber?: string | null;
  reportTitle?: string | null;
  engagementTitle?: string | null;
  overallOpinion?: string | null;
  issuedOn?: string | null;
  recipients: ReportRecipientInput[];
  blob?: Blob | null;
  fileName?: string | null;
}): Promise<ReportDistributionResult> {
  const artifact = await sealIssuedReportArtifact({
    reportId: input.reportId,
    reportNumber: input.reportNumber,
    blob: input.blob,
    fileName: input.fileName,
  });

  if (!artifact.ok || !artifact.attachmentId) {
    return {
      artifact,
      results: input.recipients.map((recipient) => ({
        recipient,
        outcome: 'blocked' as const,
        requestId: null,
        blockers: [artifact.code ?? 'attachment_unavailable'],
      })),
      acceptedCount: 0,
      blockedCount: input.recipients.length,
    };
  }

  const issuedOn = (input.issuedOn || new Date().toISOString()).slice(0, 10);
  const reference = input.reportNumber?.trim() || input.reportTitle?.trim() || 'Internal Audit Report';
  const results: ReportDistributionRecipientResult[] = [];

  for (const recipient of input.recipients) {
    const emission = await emitInternalAuditCommunication({
      eventCode: IA_REPORT_ISSUED_EVENT,
      entityId: input.reportId,
      occurrence: `issued:v${artifact.versionNumber ?? 1}:${(recipient.email || recipient.userId || recipient.name || '')
        .trim()
        .toLowerCase()}`,
      recipientName: recipient.name?.trim() || recipient.email || 'Recipient',
      recipientEmail: recipient.email ?? null,
      recipientUserId: recipient.userId ?? null,
      audience: 'internal',
      reference,
      values: {
        engagementTitle: input.engagementTitle ?? '',
        issuedOn,
        versionNumber: String(artifact.versionNumber ?? 1),
        overallOpinion: input.overallOpinion ?? '',
        artifactName: artifact.fileName,
      },
      attachments: [
        {
          attachmentId: artifact.attachmentId,
          disposition: 'attachment',
          requiredForDelivery: true,
          requirementScope: 'attachment_capable_channels',
        },
      ],
    });

    results.push({
      recipient,
      outcome: emission.outcome as ReportDistributionRecipientResult['outcome'],
      requestId: emission.requestId ?? null,
      blockers: emission.blockers ?? [],
    });
  }

  const acceptedCount = results.filter((r) => r.outcome === 'queued' || r.outcome === 'sent').length;
  return { artifact, results, acceptedCount, blockedCount: results.length - acceptedCount };
}
