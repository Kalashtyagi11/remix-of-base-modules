/**
 * INTERNAL AUDIT — formal stage-document production and sealing.
 *
 * Produces the official business document (Audit Intimation, Scope Notice,
 * Document Request Letter, Meeting Notice, Exit Pack, Closure Memorandum) from
 * the approved letter template content that the operator has reviewed on
 * screen, then persists it ONCE in the existing governed register
 * (`ia_document_artifact`) via `ia_register_document_artifact(seal => true)`.
 *
 * Transient browser bytes are never treated as the official document: after
 * sealing, every later distribution reuses the exact sealed bytes.
 */
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { sha256Hex } from './planDistributionCommunicationService';
import { IA_ARTIFACT_BUCKET } from './reportDistributionCommunicationService';
import {
  registerArtifactAttachment,
  findSealedArtifact,
  type AuditDocumentPolicyEntry,
  type ResolvedArtifact,
} from './auditCommunicationDocumentPolicy';

export interface StageDocumentInput {
  policy: AuditDocumentPolicyEntry;
  entityId: string;
  /** Document heading, e.g. "Audit Intimation". */
  title: string;
  /** Business reference shown on the letter, e.g. the engagement number. */
  reference: string;
  /** Reviewed letter body exactly as the operator approved it on screen. */
  body: string;
  recipientName?: string | null;
  departmentName?: string | null;
  metaLines?: string[];
}

export interface SealedStageDocument {
  ok: boolean;
  artifact: ResolvedArtifact | null;
  reused: boolean;
  code: string | null;
}

function safeFileName(name: string): string {
  return (name || 'Internal-Audit-Document.pdf')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

/** Branded formal letter PDF. */
export function buildStageDocumentPdf(input: StageDocumentInput): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  doc.setFillColor(23, 55, 94);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('St. Kitts & Nevis Social Security Board', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Internal Audit Department', margin, 19);

  y = 38;
  doc.setTextColor(23, 55, 94);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(input.title, margin, y);
  y += 8;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const meta = [
    `Reference: ${input.reference || '—'}`,
    input.departmentName ? `Auditee: ${input.departmentName}` : null,
    input.recipientName ? `Addressee: ${input.recipientName}` : null,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    ...(input.metaLines ?? []),
  ].filter(Boolean) as string[];
  meta.forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });

  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10.5);
  const lines = doc.splitTextToSize(input.body || '', pageWidth - margin * 2);
  const pageHeight = doc.internal.pageSize.getHeight();
  lines.forEach((line: string) => {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin, y);
    y += 5.6;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${input.policy.classification === 'confidential' ? 'CONFIDENTIAL' : 'INTERNAL'} — Internal Audit formal document`,
      margin,
      pageHeight - 10,
    );
    doc.text(`Page ${p} of ${pages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  return doc;
}

/**
 * Generate + seal the formal stage document once.
 * If a sealed artifact already exists it is reused unchanged.
 */
export async function generateAndSealStageDocument(
  input: StageDocumentInput,
): Promise<SealedStageDocument> {
  const existing = await findSealedArtifact(
    input.policy.sourceEntityType,
    input.entityId,
    input.policy.artifactType,
  );
  if (existing) {
    const reg = await registerArtifactAttachment(existing);
    return {
      ok: !!reg.attachmentId,
      artifact: { ...existing, attachmentId: reg.attachmentId },
      reused: true,
      code: reg.code,
    };
  }

  const fileName = safeFileName(
    `${input.policy.artifactType}-${(input.reference || input.entityId).slice(0, 40)}.pdf`,
  );

  let blob: Blob;
  try {
    blob = buildStageDocumentPdf(input).output('blob');
  } catch {
    return { ok: false, artifact: null, reused: false, code: 'document_render_failed' };
  }

  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength === 0) {
    return { ok: false, artifact: null, reused: false, code: 'artifact_bytes_unavailable' };
  }
  const checksum = await sha256Hex(bytes);
  const storagePath = `stage-documents/${input.entityId}/${input.policy.artifactType}/${checksum.slice(0, 12)}-${fileName}`;

  const upload = await supabase.storage
    .from(IA_ARTIFACT_BUCKET)
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });
  if (upload.error) {
    return { ok: false, artifact: null, reused: false, code: 'artifact_upload_failed' };
  }

  const { data, error } = await supabase.rpc('ia_register_document_artifact', {
    p_source_entity_type: input.policy.sourceEntityType,
    p_source_entity_id: input.entityId,
    p_artifact_type: input.policy.artifactType,
    p_file_name: fileName,
    p_storage_path: storagePath,
    p_byte_size: bytes.byteLength,
    p_checksum_sha256: checksum,
    p_seal: true,
    p_mime_type: 'application/pdf',
    p_classification: input.policy.classification,
  } as never);

  if (error) return { ok: false, artifact: null, reused: false, code: 'artifact_registration_failed' };
  const row = (data ?? {}) as { ok?: boolean; artifact_id?: string; version_number?: number; code?: string };
  if (!row.ok || !row.artifact_id) {
    return { ok: false, artifact: null, reused: false, code: row.code ?? 'artifact_registration_failed' };
  }

  const artifact: ResolvedArtifact = {
    artifactId: row.artifact_id,
    attachmentId: null,
    documentNumber: fileName.replace(/\.pdf$/i, ''),
    fileName,
    versionNumber: row.version_number ?? 1,
    status: 'Sealed',
    byteSize: bytes.byteLength,
    checksum,
    classification: input.policy.classification,
    storagePath,
    generatedAt: new Date().toISOString(),
    issuedAt: null,
  };

  const reg = await registerArtifactAttachment(artifact);
  return {
    ok: !!reg.attachmentId,
    artifact: { ...artifact, attachmentId: reg.attachmentId },
    reused: false,
    code: reg.code,
  };
}
