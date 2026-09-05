/**
 * Batch Operations Hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/bn/batchOperationsService';

export function useBnBatches(filters: svc.BatchFilters = {}) {
  return useQuery({
    queryKey: ['bn', 'batches', filters],
    queryFn: () => svc.fetchBatches(filters),
    refetchInterval: 30_000,
  });
}

export function useBnBatchDetail(batchId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'batch', batchId],
    queryFn: () => svc.fetchBatchDetail(batchId!),
    enabled: !!batchId,
  });
}

export function useBnBatchItems(batchId: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'batch-items', batchId],
    queryFn: () => svc.fetchBatchItems(batchId!),
    enabled: !!batchId,
  });
}

export function useBnAvailablePayables(paymentMethod?: string, officeCode?: string) {
  return useQuery({
    queryKey: ['bn', 'available-payables', paymentMethod, officeCode],
    queryFn: () => svc.fetchAvailablePayables(paymentMethod, officeCode),
  });
}

export function useBnAvailablePayablesDetailed(paymentMethod?: string, officeCode?: string) {
  return useQuery({
    queryKey: ['bn', 'available-payables-detailed', paymentMethod, officeCode],
    queryFn: () => svc.fetchAvailablePayablesDetailed(paymentMethod, officeCode),
  });
}


export function useBnBatchSummary() {
  return useQuery({
    queryKey: ['bn', 'batch-summary'],
    queryFn: () => svc.fetchBatchSummaryStats(),
    refetchInterval: 30_000,
  });
}

export function useExecuteBatchAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['bn', 'batch', 'action'],
    mutationFn: (params: svc.ExecuteBatchActionParams) => svc.executeBatchAction(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bn', 'batches'] });
      qc.invalidateQueries({ queryKey: ['bn', 'batch'] });
      qc.invalidateQueries({ queryKey: ['bn', 'batch-items'] });
      qc.invalidateQueries({ queryKey: ['bn', 'batch-summary'] });
      qc.invalidateQueries({ queryKey: ['bn', 'available-payables'] });
      qc.invalidateQueries({ queryKey: ['bn', 'payables'] });
    },
  });
}
