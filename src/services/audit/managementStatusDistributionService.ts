/**
 * INTERNAL AUDIT — Management Status Report: sealing and governed distribution.
 *
 * Reuses the EXISTING artifact and Omni-Comms mechanisms exactly as the issued
 * final report does. No new document store, no new sending path, no bytes ever
 * handed to a provider by Internal Audit.
 *
 *   snapshot generated → PDF rendered once → private `ia-artifacts`
 *                      → SHA-256 → ia_register_document_artifact(seal = true)
 *                      → omni_comms_register_attachment
 *                      → emitInternalAuditCommunication(INTERNAL_AUDIT.REPORT.ISSUED)
 */
import { supabase } from '@/integrations/supabase/client';
import { resolveBusinessCommunicationScope } from '@/platform/omni-comms/integrations/business/businessScopeResolver';
import { emitInternalAuditCommunication } from '@/platform/omni-comms/integrations/business/internal-audit/internalAuditCommunicationProducer';
import { INTERNAL_AUDIT_MODULE_CODE } from '@/platform/omni-comms/integrations/business/internal-audit/internalAuditCommunicationCatalogue';
import { sha256Hex } from './planDistributionCommunicationService';
import {
  IA_ARTIFACT_BUCKET,
  IA_REPORT_ISSUED_EVENT,
  type ReportRecipientInput,
  type ReportDistributionRecipientResult,
} from './reportDistributionCommunicationService';
import { attachManagementStatusArtifact } from './managementStatusReportService';

export const IA_MSR_ARTIFACT_ENTITY = 'ia_management_status_report';
export const IA_MSR_ARTIFACT_TYPE = 'management_status_report';

export interface SealedManagementStatusArtifact {
  ok: boolean;
  artifactId: string | null;
  attachmentId: string | null;
  versionNumber: number | null;
  checksum: string | null;
  byteSize: number | null;
  fileName: string;
  reused: boolean;
  code: string | null;
}

function safeFileName(name: string): string {
  return (name || 'Audit-Plan-Management-Status.pdf')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

async function registerAttachment(
  artifactId: string,
  storagePath: string,
  fileName: string,
  byteSize: number,
  checksum: string,
) {
  const scope = await resolveBusinessCommunicationScope({ moduleCode: INTERNAL_AUDIT_MODULE_CODE });
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

/** Seal a snapshot's PDF once; later distributions reuse the same sealed bytes. */
export async function sealManagementStatusArtifact(input: {
  reportId: string;
  reportNumber?: string | null;
  blob?: Blob | null;
}): Promise<SealedManagementStatusArtifact> {
  const fileName = safeFileName(`${input.reportNumber || 'Audit-Plan-Management-Status'}.pdf`);
  const base: SealedManagementStatusArtifact = {
    ok: false, artifactId: null, attachmentId: null, versionNumber: null,
    checksum: null, byteSize: null, fileName, reused: false, code: null,
  };

  const { data: existing } = await supabase
    .from('ia_document_artifact')
    .select('*')
    .eq('source_entity_type', IA_MSR_ARTIFACT_ENTITY)
    .eq('source_entity_id', input.reportId)
    .eq('artifact_type', IA_MSR_ARTIFACT_TYPE)
    .eq('status', 'Sealed')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as Record<string, any>;
    const reg = await registerAttachment(
      row.id, row.storage_path, row.file_name, Number(row.byte_size), row.checksum_sha256,
    );
    return {
      ...base,
      ok: !!reg.attachmentId,
      artifactId: row.id,
      attachmentId: reg.attachmentId,
      versionNumber: row.version_number,
      checksum: row.checksum_sha256,
      byteSize: Number(row.byte_size),
      fileName: row.file_name,
      reused: true,
      code: reg.code,
    };
  }

  if (!input.blob || input.blob.size === 0) return { ...base, code: 'artifact_bytes_unavailable' };

  const bytes = await input.blob.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  const storagePath = `management-status/${input.reportId}/${checksum.slice(0, 12)}-${fileName}`;

  const upload = await supabase.storage
    .from(IA_ARTIFACT_BUCKET)
    .upload(storagePath, input.blob, { contentType: 'application/pdf', upsert: true });
  if (upload.error) return { ...base, checksum, code: 'artifact_upload_failed' };

  const { data, error } = await supabase.rpc('ia_register_document_artifact', {
    p_source_entity_type: IA_MSR_ARTIFACT_ENTITY,
    p_source_entity_id: input.reportId,
    p_artifact_type: IA_MSR_ARTIFACT_TYPE,
    p_file_name: fileName,
    p_storage_path: storagePath,
    p_byte_size: bytes.byteLength,
    p_checksum_sha256: checksum,
    p_seal: true,
    p_mime_type: 'application/pdf',
    p_classification: 'confidential',
  } as never);

  if (error) return { ...base, checksum, code: 'artifact_registration_failed' };
  const row = (data ?? {}) as { ok?: boolean; artifact_id?: string; version_number?: number; code?: string };
  if (!row.ok || !row.artifact_id) return { ...base, checksum, code: row.code ?? 'artifact_registration_failed' };

  await attachManagementStatusArtifact(input.reportId, row.artifact_id);

  const reg = await registerAttachment(row.artifact_id, storagePath, fileName, bytes.byteLength, checksum);
  return {
    ok: !!reg.attachmentId,
    artifactId: row.artifact_id,
    attachmentId: reg.attachmentId,
    versionNumber: row.version_number ?? 1,
    checksum,
    byteSize: bytes.byteLength,
    fileName,
    reused: false,
    code: reg.code,
  };
}

export async function distributeManagementStatusReport(input: {
  reportId: string;
  reportNumber?: string | null;
  planTitle?: string | null;
  audience: string;
  statusAsAt: string;
  recipients: ReportRecipientInput[];
  blob?: Blob | null;
}): Promise<{
  artifact: SealedManagementStatusArtifact;
  results: ReportDistributionRecipientResult[];
  acceptedCount: number;
  blockedCount: number;
}> {
  const artifact = await sealManagementStatusArtifact({
    reportId: input.reportId,
    reportNumber: input.reportNumber,
    blob: input.blob,
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

  const results: ReportDistributionRecipientResult[] = [];
  for (const recipient of input.recipients) {
    const emission = await emitInternalAuditCommunication({
      eventCode: IA_REPORT_ISSUED_EVENT,
      entityId: input.reportId,
      occurrence: `msr:${artifact.versionNumber ?? 1}:${(recipient.email || recipient.userId || recipient.name || '')
        .trim()
        .toLowerCase()}`,
      recipientName: recipient.name?.trim() || recipient.email || 'Recipient',
      recipientEmail: recipient.email ?? null,
      recipientUserId: recipient.userId ?? null,
      audience: 'internal',
      reference: input.reportNumber || 'Audit Plan Management Status Report',
      values: {
        engagementTitle: input.planTitle ?? '',
        issuedOn: (input.statusAsAt || new Date().toISOString()).slice(0, 10),
        versionNumber: String(artifact.versionNumber ?? 1),
        overallOpinion: input.audience,
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
