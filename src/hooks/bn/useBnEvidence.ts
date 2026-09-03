import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as evidenceService from '@/services/bn/evidenceService';
import type { BnServiceDocType, BnDocRequirement, BnClaimEvidence } from '@/types/bn';

// ── Reference Data ──

export function useBnServiceDocTypes(opts?: evidenceService.ServiceDocTypeListOptions) {
  return useQuery({
    queryKey: ['bn', 'service-doc-types', opts ?? {}],
    queryFn: () => evidenceService.fetchServiceDocTypes(opts),
  });
}

export function useUpsertServiceDocType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (record: Partial<BnServiceDocType>) => evidenceService.upsertServiceDocType(record),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bn', 'service-doc-types'] }),
  });
}

export function useDeleteServiceDocType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evidenceService.deleteServiceDocType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bn', 'service-doc-types'] }),
  });
}

// ── Doc Requirements ──

export function useBnDocRequirements(productId?: string, stage?: string) {
  return useQuery({
    queryKey: ['bn', 'doc-requirements', productId, stage],
    queryFn: () => evidenceService.fetchDocRequirements(productId, stage),
    enabled: !!productId,
  });
}

export function useUpsertDocRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (record: Partial<BnDocRequirement>) => evidenceService.upsertDocRequirement(record),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bn', 'doc-requirements'] }),
  });
}

export function useDeleteDocRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evidenceService.deleteDocRequirement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bn', 'doc-requirements'] }),
  });
}

// ── Claim Evidence ──

export function useBnClaimEvidence(claimId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'claim-evidence', claimId],
    queryFn: () => evidenceService.fetchClaimEvidence(claimId!),
    enabled: !!claimId,
  });
}

export function useUploadEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: evidenceService.UploadEvidenceParams) => evidenceService.uploadEvidence(params),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', vars.claimId] });
    },
  });
}

export function useVerifyEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, userCode }: { evidenceId: string; userCode: string }) =>
      evidenceService.verifyEvidence(evidenceId, userCode),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', data.claim_id] });
    },
  });
}

export function useRejectEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, reason, userCode }: { evidenceId: string; reason: string; userCode: string }) =>
      evidenceService.rejectEvidence(evidenceId, reason, userCode),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', data.claim_id] });
    },
  });
}

export function useWaiveEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, reason, authorityLevel, userCode }: { evidenceId: string; reason: string; authorityLevel: number; userCode: string }) =>
      evidenceService.waiveEvidence(evidenceId, reason, authorityLevel, userCode),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', data.claim_id] });
    },
  });
}

export function useDeleteEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, reason, userCode }: { evidenceId: string; reason: string; userCode: string }) =>
      evidenceService.deleteEvidence(evidenceId, reason, userCode),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-complete', data.claim_id] });
    },
  });
}

export function useRequestMoreInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, reason, userCode }: { evidenceId: string; reason: string; userCode: string }) =>
      evidenceService.requestMoreInfo(evidenceId, reason, userCode),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim-evidence', data.claim_id] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', data.claim_id] });
    },
  });
}

// ── Checklist ──

export function useBnEvidenceChecklist(claimId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'evidence-checklist', claimId],
    queryFn: () => evidenceService.getEvidenceChecklist(claimId!),
    enabled: !!claimId,
  });
}

export function useBnIsEvidenceComplete(claimId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'evidence-complete', claimId],
    queryFn: () => evidenceService.isEvidenceComplete(claimId!),
    enabled: !!claimId,
  });
}

export function useMarkChecklistPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, checklistId, reason, userCode }: { claimId: string; checklistId: string; reason: string; userCode: string }) =>
      evidenceService.markChecklistPending(claimId, checklistId, reason, userCode),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-complete', vars.claimId] });
    },
  });
}

export function useWaiveChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, checklistId, reason, userCode }: { claimId: string; checklistId: string; reason: string; userCode: string }) =>
      evidenceService.waiveChecklistItem(claimId, checklistId, reason, userCode),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-checklist', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-audit', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'evidence-complete', vars.claimId] });
    },
  });
}



// ── Audit ──

export function useBnEvidenceAudit(claimId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'evidence-audit', claimId],
    queryFn: () => evidenceService.fetchEvidenceAudit(claimId!),
    enabled: !!claimId,
  });
}
