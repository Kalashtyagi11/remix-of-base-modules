import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as decisionEngine from '@/services/bn/decisionEngine';
import type { BnAvailableAction, BnClaimDecision, BnReasonCode } from '@/types/bn';

export function useBnAvailableActions(claimId: string | undefined, userRoles: string[], productCategory?: string | null, countryCode?: string | null) {
  return useQuery({
    queryKey: ['bn', 'available-actions', claimId, userRoles],
    queryFn: () => decisionEngine.getAvailableTransitions(claimId!, userRoles, productCategory, countryCode),
    enabled: !!claimId && userRoles.length > 0,
  });
}

export function useBnExecuteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['bn', 'execute-action'],
    mutationFn: (params: decisionEngine.ExecuteTransitionParams) =>
      decisionEngine.executeTransition(params),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['bn', 'claim', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'claims'] });
      qc.invalidateQueries({ queryKey: ['bn', 'available-actions', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'claim-decisions', vars.claimId] });
      qc.invalidateQueries({ queryKey: ['bn', 'claim-events', vars.claimId] });
      // Workbasket views: any status change can move the claim between baskets
      qc.invalidateQueries({ queryKey: ['bn', 'queue-claims'] });
      qc.invalidateQueries({ queryKey: ['bn', 'workbaskets'] });
      qc.invalidateQueries({ queryKey: ['bn', 'my-queue'] });
      qc.invalidateQueries({ queryKey: ['bn', 'basket-claim-counts'] });
    },
  });
}

export function useBnClaimDecisions(claimId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'claim-decisions', claimId],
    queryFn: () => decisionEngine.fetchClaimDecisions(claimId!),
    enabled: !!claimId,
  });
}

export function useBnReasonCodes(actionCode: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'reason-codes', actionCode],
    queryFn: () => decisionEngine.fetchReasonCodesForAction(actionCode!),
    enabled: !!actionCode,
  });
}
