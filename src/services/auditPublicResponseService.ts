/**
 * Phase F — Public submission service for the tokenized employer portal.
 *
 * All operations validate the link_token against ce_audit_report_acknowledgments
 * (active + not expired) before reading or writing. No auth required.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  FindingResponseSubmission,
  FindingDisputeSubmission,
  SubmitFindingResponseInput,
  SubmitFindingDisputeInput,
} from '@/types/auditPublicSubmissions';
import { notifySubmissionReceived, notifySubmissionLinked } from './auditPublicSubmissionNotifyService';
import { linkResponseSubmission, linkDisputeSubmission } from './auditPublicSubmissionLinkService';
import {
  loadAcknowledgmentSnapshot,
  recordOnlineResponseSubmission,
} from './onlineResponseSubmissionAuditService';

interface ValidatedToken {
  acknowledgmentId: string;
  reportId: string;
  inspectionId: string;
  expiresAt: string;
}

/**
 * Resolve a link_token → ack record + the inspection it belongs to.
 * Throws if the link is invalid, revoked, or expired.
 */
export async function validateSubmissionToken(token: string): Promise<ValidatedToken> {
  if (!token) throw new Error('Missing access token');

  const { data: ack, error } = await (supabase as any)
    .from('ce_audit_report_acknowledgments')
    .select('id, report_id, status, expires_at')
    .eq('link_token', token)
    .maybeSingle();

  if (error) throw error;
  if (!ack) throw new Error('Invalid acknowledgment link');
  if (ack.status === 'REVOKED') throw new Error('This link has been revoked');
  if (new Date(ack.expires_at) < new Date()) throw new Error('This link has expired');

  // Resolve inspection_id from the parent audit report
  const { data: report, error: rErr } = await (supabase as any)
    .from('ce_employer_audit_reports')
    .select('inspection_id')
    .eq('id', ack.report_id)
    .maybeSingle();

  if (rErr) throw rErr;
  if (!report?.inspection_id) throw new Error('Report has no linked inspection');

  return {
    acknowledgmentId: ack.id,
    reportId: ack.report_id,
    inspectionId: report.inspection_id,
    expiresAt: ack.expires_at,
  };
}

// ─── Submissions: create from public portal ──────────────────────

export async function submitFindingResponse(input: SubmitFindingResponseInput): Promise<FindingResponseSubmission> {
  const ctx = await validateSubmissionToken(input.token);
  if (ctx.inspectionId !== input.inspectionId) {
    throw new Error('Token does not match this inspection');
  }
  if (!input.responseText?.trim()) throw new Error('Response text is required');
  if (!input.submitterName?.trim()) throw new Error('Submitter name is required');

  const row = {
    inspection_id: input.inspectionId,
    finding_id: input.findingId,
    acknowledgment_id: ctx.acknowledgmentId,
    link_token: input.token,
    submitter_name: input.submitterName.trim(),
    submitter_designation: input.submitterDesignation ?? null,
    submitter_email: input.submitterEmail ?? null,
    response_text: input.responseText.trim(),
    attachment_url: input.attachmentUrl ?? null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    status: 'RECEIVED',
  };
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_response_submissions')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  const created = data as FindingResponseSubmission;
  // Phase 6 — audit + workflow routing using the FROZEN snapshot
  try {
    const snap = await loadAcknowledgmentSnapshot(ctx.acknowledgmentId);
    await recordOnlineResponseSubmission({
      acknowledgmentId: ctx.acknowledgmentId,
      inspectionId: created.inspection_id,
      reportId: snap.report_id ?? null,
      kind: 'response',
      submissionId: created.id,
      submitterName: created.submitter_name,
      submitterEmail: created.submitter_email ?? null,
      snapshot: snap,
    });
  } catch (e) {
    console.warn('[submitFindingResponse] audit/workflow skipped:', e);
  }
  // Fire-and-forget officer notification
  notifySubmissionReceived(
    created.inspection_id,
    {
      kind: 'response',
      submitter_name: created.submitter_name,
      finding_ref: created.finding_id,
      inspection_ref: created.inspection_id,
    },
    created.id,
  );
  return created;
}

export async function submitFindingDispute(input: SubmitFindingDisputeInput): Promise<FindingDisputeSubmission> {
  const ctx = await validateSubmissionToken(input.token);
  if (ctx.inspectionId !== input.inspectionId) {
    throw new Error('Token does not match this inspection');
  }
  if (!input.findingId && !input.violationId) {
    throw new Error('A finding or violation reference is required');
  }
  if (!input.disputeReason?.trim()) throw new Error('Dispute reason is required');
  if (!input.disputeDetails?.trim()) throw new Error('Dispute details are required');

  const row = {
    inspection_id: input.inspectionId,
    finding_id: input.findingId ?? null,
    violation_id: input.violationId ?? null,
    acknowledgment_id: ctx.acknowledgmentId,
    link_token: input.token,
    submitter_name: input.submitterName.trim(),
    submitter_designation: input.submitterDesignation ?? null,
    submitter_email: input.submitterEmail ?? null,
    dispute_reason: input.disputeReason.trim(),
    dispute_details: input.disputeDetails.trim(),
    evidence_url: input.evidenceUrl ?? null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    status: 'RECEIVED',
  };
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_dispute_submissions')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  const created = data as FindingDisputeSubmission;
  // Phase 6 — audit + workflow routing using FROZEN snapshot
  try {
    const snap = await loadAcknowledgmentSnapshot(ctx.acknowledgmentId);
    await recordOnlineResponseSubmission({
      acknowledgmentId: ctx.acknowledgmentId,
      inspectionId: created.inspection_id,
      reportId: snap.report_id ?? null,
      kind: 'dispute',
      submissionId: created.id,
      submitterName: created.submitter_name,
      submitterEmail: created.submitter_email ?? null,
      snapshot: snap,
    });
  } catch (e) {
    console.warn('[submitFindingDispute] audit/workflow skipped:', e);
  }
  notifySubmissionReceived(
    created.inspection_id,
    {
      kind: 'dispute',
      submitter_name: created.submitter_name,
      finding_ref: created.finding_id ?? created.violation_id ?? '—',
      inspection_ref: created.inspection_id,
    },
    created.id,
  );
  return created;
}

// ─── Public read-back: what the portal shows ──────────────────────

/**
 * Returns submissions made under the same token (so an employer can see
 * what they've already submitted on this link). Token-scoped, not employer-scoped.
 */
export async function listMySubmissions(token: string): Promise<{
  responses: FindingResponseSubmission[];
  disputes: FindingDisputeSubmission[];
}> {
  await validateSubmissionToken(token);
  const [resps, disps] = await Promise.all([
    (supabase as any).from('ce_audit_finding_response_submissions').select('*').eq('link_token', token).order('submitted_at', { ascending: false }),
    (supabase as any).from('ce_audit_finding_dispute_submissions').select('*').eq('link_token', token).order('submitted_at', { ascending: false }),
  ]);
  if (resps.error) throw resps.error;
  if (disps.error) throw disps.error;
  return {
    responses: (resps.data ?? []) as FindingResponseSubmission[],
    disputes: (disps.data ?? []) as FindingDisputeSubmission[],
  };
}

// ─── Officer-side queries (regular logged-in screens) ─────────────

export async function listResponseSubmissionsForInspection(inspectionId: string): Promise<FindingResponseSubmission[]> {
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_response_submissions')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FindingResponseSubmission[];
}

export async function listDisputeSubmissionsForInspection(inspectionId: string): Promise<FindingDisputeSubmission[]> {
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_dispute_submissions')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FindingDisputeSubmission[];
}

export async function listResponseSubmissionsForFinding(findingId: string): Promise<FindingResponseSubmission[]> {
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_response_submissions')
    .select('*')
    .eq('finding_id', findingId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FindingResponseSubmission[];
}

export async function listDisputeSubmissionsForFinding(findingId: string): Promise<FindingDisputeSubmission[]> {
  const { data, error } = await (supabase as any)
    .from('ce_audit_finding_dispute_submissions')
    .select('*')
    .eq('finding_id', findingId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FindingDisputeSubmission[];
}

export async function updateResponseSubmissionStatus(
  id: string,
  status: FindingResponseSubmission['status'],
  reviewerNotes: string | null,
  reviewedBy: string | null
): Promise<void> {
  const { data: updated, error } = await (supabase as any)
    .from('ce_audit_finding_response_submissions')
    .update({
      status,
      reviewer_notes: reviewerNotes,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  if (status === 'ACCEPTED' && updated && !updated.linked_response_id) {
    try {
      const linkedId = await linkResponseSubmission(updated as FindingResponseSubmission, { userCode: reviewedBy });
      notifySubmissionLinked(updated.inspection_id, {
        kind: 'response',
        submitter_name: updated.submitter_name,
        inspection_ref: updated.inspection_id,
      }, linkedId);
    } catch (e) {
      console.warn('[auto-link response]', e);
    }
  }
}

export async function updateDisputeSubmissionStatus(
  id: string,
  status: FindingDisputeSubmission['status'],
  reviewerNotes: string | null,
  reviewedBy: string | null
): Promise<void> {
  const { data: updated, error } = await (supabase as any)
    .from('ce_audit_finding_dispute_submissions')
    .update({
      status,
      reviewer_notes: reviewerNotes,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  if (status === 'UPHELD' && updated && !updated.linked_dispute_id) {
    try {
      const linkedId = await linkDisputeSubmission(updated as FindingDisputeSubmission, { userCode: reviewedBy });
      notifySubmissionLinked(updated.inspection_id, {
        kind: 'dispute',
        submitter_name: updated.submitter_name,
        inspection_ref: updated.inspection_id,
      }, linkedId);
    } catch (e) {
      console.warn('[auto-link dispute]', e);
    }
  }
}
