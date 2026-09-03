/**
 * Post-Issue Review Hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/bn/postIssueService';

export function useBnPostIssueTasks(filters: svc.PostIssueFilters = {}) {
  return useQuery({
    queryKey: ['bn', 'post-issue-tasks', filters],
    queryFn: () => svc.fetchPostIssueTasks(filters),
    refetchInterval: 15_000,
  });
}

export function useBnPostIssueTaskDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['bn', 'post-issue-task', id],
    queryFn: () => svc.fetchPostIssueTaskDetail(id!),
    enabled: !!id,
  });
}

export function useBnPostIssueSummary(batchId?: string) {
  return useQuery({
    queryKey: ['bn', 'post-issue-summary', batchId],
    queryFn: () => svc.fetchPostIssueSummary(batchId),
    refetchInterval: 15_000,
  });
}

export function useGeneratePostIssueTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, userCode }: { batchId?: string; userCode: string }) =>
      batchId
        ? svc.generatePostIssueTasks(batchId, userCode)
        : svc.generateMissingPostIssueTasks(userCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-tasks'] });
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-summary'] });
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-missing'] });
    },
  });
}

/** Count of issued payments whose checklist has never been generated. */
export function useBnPostIssueMissingCount() {
  return useQuery({
    queryKey: ['bn', 'post-issue-missing'],
    queryFn: () => svc.countIssuedRecordsMissingTasks(),
    refetchInterval: 30_000,
  });
}


export function useExecutePostIssueAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: svc.ExecutePostIssueActionParams) => svc.executePostIssueAction(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-tasks'] });
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-task'] });
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-summary'] });
      qc.invalidateQueries({ queryKey: ['bn', 'batches'] });
      qc.invalidateQueries({ queryKey: ['bn', 'entitlements'] });
    },
  });
}

export function useExecuteAllPendingTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, userCode }: { batchId: string; userCode: string }) =>
      svc.executeAllPendingTasks(batchId, userCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-tasks'] });
      qc.invalidateQueries({ queryKey: ['bn', 'post-issue-summary'] });
      qc.invalidateQueries({ queryKey: ['bn', 'batches'] });
      qc.invalidateQueries({ queryKey: ['bn', 'entitlements'] });
    },
  });
}
