import { supabase } from '@/integrations/supabase/client';
import {
  AUDIT_ATTACHMENT_BUCKET,
  removeAuditObjects,
  uploadAuditAttachment,
  validateAuditFile,
} from './auditAttachmentUpload';
import { getAuditFileUrl, normaliseAuditFilePath } from './auditFileAccess';

/**
 * Internal Audit — Phase 3C canonical EVIDENCE service.
 *
 * ONE upload path, ONE access path, ONE evidence record (`ia_evidence`), and a
 * separate relationship model (`ia_evidence_links`). A physical file is stored
 * exactly once no matter how many audit objects rely on it.
 *
 * Integrity: SHA-256 over the raw file bytes, computed at the point of upload
 * from the same bytes that are sent to storage, persisted in
 * `ia_evidence.hash` with `hash_algorithm = 'SHA-256'`. The value is immutable
 * once written (enforced by `ia_guard_evidence_mutation`). A replaced file is a
 * NEW evidence record; the original is withdrawn/superseded, never rewritten.
 */

export type EvidenceLinkedType =
  | 'programme_step'
  | 'control_test'
  | 'sample_item'
  | 'exception'
  | 'finding'
  | 'working_paper'
  | 'activity';

export interface EvidenceLinkRequest {
  linked_type: EvidenceLinkedType;
  linked_id: string;
  link_role?: string | null;
}

export interface CreateEvidenceInput {
  engagementId: string;
  file: File;
  /** Business meaning — what this evidence supports. */
  description: string;
  source?: string | null;
  evidenceDate?: string | null;
  referenceNo?: string | null;
  uploadedBy?: string | null;
  /** Context inherited from the point of work — never re-keyed by the auditor. */
  links?: EvidenceLinkRequest[];
  activityId?: string | null;
}

export const EVIDENCE_HASH_ALGORITHM = 'SHA-256';

/** Deterministic SHA-256 (lowercase hex) of the exact bytes being uploaded. */
export async function computeFileHash(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface CreatedEvidence {
  id: string;
  evidence_id: string;
  file_name: string;
  storage_path: string;
  hash: string;
  links_created: number;
}

/**
 * Canonical evidence creation. Upload → hash → evidence record → relationships.
 * Any database failure after the upload triggers a compensating storage cleanup
 * so ordinary failures do not leave orphan objects behind.
 */
export async function createAuditEvidence(input: CreateEvidenceInput): Promise<CreatedEvidence> {
  const check = validateAuditFile(input.file);
  if (!check.ok) throw new Error(check.reason);
  if (!input.description?.trim()) {
    throw new Error('An evidence description is required — state what this evidence supports.');
  }

  const hash = await computeFileHash(input.file);
  const uploaded = await uploadAuditAttachment('evidence', input.engagementId, input.engagementId, input.file);

  try {
    const { data: row, error } = await (supabase as any)
      .from('ia_evidence')
      .insert({
        engagement_id: input.engagementId,
        description: input.description.trim(),
        reference_no: input.referenceNo || null,
        file_name: uploaded.originalName,
        file_url: uploaded.path,
        storage_bucket: AUDIT_ATTACHMENT_BUCKET,
        storage_path: uploaded.path,
        file_type: uploaded.mimeType,
        file_size: uploaded.size,
        hash,
        hash_algorithm: EVIDENCE_HASH_ALGORITHM,
        tags: input.source ? [`source:${input.source}`] : null,
        activity_id: input.activityId || null,
        uploaded_by: input.uploadedBy || null,
        created_by: input.uploadedBy || null,
        upload_date: input.evidenceDate || new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    let linksCreated = 0;
    for (const link of input.links ?? []) {
      const { error: linkErr } = await (supabase as any).rpc('ia_link_evidence', {
        p_evidence_id: row.id,
        p_linked_type: link.linked_type,
        p_linked_id: link.linked_id,
        p_link_role: link.link_role ?? null,
      });
      if (linkErr) throw new Error(linkErr.message);
      linksCreated += 1;
    }

    return {
      id: row.id,
      evidence_id: row.evidence_id,
      file_name: row.file_name,
      storage_path: row.storage_path,
      hash,
      links_created: linksCreated,
    };
  } catch (err) {
    // Compensating cleanup — storage and database are separate systems.
    const cleanup = await removeAuditObjects([uploaded.path]);
    if (!cleanup.cleanup_succeeded) {
      console.error('[auditEvidenceService] ORPHAN-CLEANUP-DEFECT', cleanup.cleanup_errors);
    }
    throw err;
  }
}

/** Link an existing evidence record to another audit object (no re-upload). */
export async function linkEvidence(
  evidenceId: string,
  linkedType: EvidenceLinkedType,
  linkedId: string,
  role?: string,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc('ia_link_evidence', {
    p_evidence_id: evidenceId,
    p_linked_type: linkedType,
    p_linked_id: linkedId,
    p_link_role: role ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Remove one relationship. Blocked by the server for completed/reviewed work. */
export async function unlinkEvidence(linkId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('ia_unlink_evidence', { p_link_id: linkId });
  if (error) throw new Error(error.message);
}

/** Carry supporting evidence forward from an exception to a new finding. */
export async function inheritExceptionEvidence(exceptionId: string, findingId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('ia_inherit_exception_evidence', {
    p_exception_id: exceptionId,
    p_finding_id: findingId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export interface EvidenceFileState {
  ok: boolean;
  /** true when a record exists but the underlying stored object is unavailable. */
  missingFile: boolean;
  url: string | null;
  reason?: string;
}

/**
 * Resolve short-lived authorised access. The signed URL is NEVER persisted —
 * only the canonical bucket/path is stored, and a fresh URL is minted per view.
 */
export async function resolveEvidenceAccess(evidence: {
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  file_name?: string | null;
}): Promise<EvidenceFileState> {
  const rawPath = evidence.storage_path || evidence.file_url;
  if (!rawPath) return { ok: false, missingFile: false, url: null, reason: 'No file attached' };
  const bucket = (evidence.storage_bucket as any) || AUDIT_ATTACHMENT_BUCKET;
  const path = normaliseAuditFilePath(bucket, rawPath);
  const url = await getAuditFileUrl(bucket, path);
  if (!url) {
    return { ok: false, missingFile: true, url: null, reason: 'The stored file could not be reached' };
  }
  return { ok: true, missingFile: false, url };
}

/** Open evidence through canonical private signed access. */
export async function openAuditEvidence(evidence: Parameters<typeof resolveEvidenceAccess>[0]): Promise<EvidenceFileState> {
  const state = await resolveEvidenceAccess(evidence);
  if (state.url) window.open(state.url, '_blank', 'noopener,noreferrer');
  return state;
}

export interface EvidenceWithLinks {
  id: string;
  evidence_id: string;
  description: string | null;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_url: string | null;
  hash: string | null;
  uploaded_by: string | null;
  upload_date: string | null;
  withdrawn_at?: string | null;
  link_id?: string;
  link_role?: string | null;
  linked_type?: string;
}

/** Evidence linked to one audit object (test, sample item, exception, finding…). */
export async function fetchLinkedEvidence(
  linkedType: EvidenceLinkedType,
  linkedId: string,
): Promise<EvidenceWithLinks[]> {
  const { data, error } = await (supabase as any)
    .from('ia_evidence_links')
    .select('id, link_role, linked_type, evidence:ia_evidence(*)')
    .eq('linked_type', linkedType)
    .eq('linked_id', linkedId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[])
    .filter(r => r.evidence)
    .map(r => ({ ...r.evidence, link_id: r.id, link_role: r.link_role, linked_type: r.linked_type }));
}
