/**
 * Hooks for engagement execution lifecycle:
 * - Launch readiness check
 * - Launch engagement
 * - Transition execution status
 * - Execution log (audit trail)
 * - Document requests
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserCode } from '@/hooks/useUserCode';
import { ENGAGEMENT_STATES, type EngagementState } from '@/config/auditWorkflowVocabulary';

// ============= Execution Statuses =============

// Stage 2E (DEF-E2E-012): re-exported from the canonical workflow contract.
export const EXECUTION_STATUSES = ENGAGEMENT_STATES;

export type ExecutionStatus = EngagementState;

// ============= Launch Readiness =============

export interface ReadinessCheck {
  item: string;
  passed: boolean;
  detail?: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  error?: string;
}

export function useLaunchReadiness(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_launch_readiness', engagementId],
    queryFn: async (): Promise<ReadinessResult> => {
      const { data, error } = await supabase.rpc('ia_check_launch_readiness' as any, {
        p_engagement_id: engagementId!,
      });
      if (error) throw error;
      return data as unknown as ReadinessResult;
    },
    enabled: !!engagementId,
  });
}

// ============= Launch Engagement =============

export function useLaunchEngagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userCode } = useUserCode();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_engagements', 'create'],
    mutationFn: async (engagementId: string) => {
      const { data, error } = await supabase.rpc('ia_launch_engagement' as any, {
        p_engagement_id: engagementId,
        p_launched_by: userCode || 'SYSTEM',
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Launch failed');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ia_audit_engagements'] });
      queryClient.invalidateQueries({ queryKey: ['ia_launch_readiness'] });
      queryClient.invalidateQueries({ queryKey: ['ia_execution_log'] });
      toast({ title: 'Engagement Launched', description: 'The engagement is now active for execution.' });
    },
    onError: (e: any) => {
      toast({ title: 'Launch Failed', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Transition Execution Status =============

export function useTransitionExecutionStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userCode } = useUserCode();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_engagements', 'status_change'],
    mutationFn: async (params: { engagementId: string; newStatus: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('ia_transition_execution_status' as any, {
        p_engagement_id: params.engagementId,
        p_new_status: params.newStatus,
        p_performed_by: userCode || 'SYSTEM',
        p_notes: params.notes || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Transition failed');
      return result;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['ia_audit_engagements'] });
      queryClient.invalidateQueries({ queryKey: ['ia_execution_log'] });
      toast({ title: 'Status Updated', description: `Execution status changed to ${params.newStatus}.` });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Execution Log (Audit Trail) =============

export function useExecutionLog(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_execution_log', engagementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ia_engagement_execution_log' as any)
        .select('*')
        .eq('engagement_id', engagementId!)
        .order('performed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!engagementId,
  });
}

// ============= Document Requests =============

export function useDocumentRequests(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_document_requests', engagementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ia_document_requests' as any)
        .select('*')
        .eq('engagement_id', engagementId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!engagementId,
  });
}

export function useDocumentRequestMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userCode } = useUserCode();

  const create = useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_engagements', 'create'],
    mutationFn: async (record: any) => {
      const { data, error } = await supabase
        .from('ia_document_requests' as any)
        .insert({ ...record, created_by: userCode || 'SYSTEM', updated_by: userCode || 'SYSTEM' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ia_document_requests'] });
      toast({ title: 'Request Created', description: 'Document request sent.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_engagements', 'create'],
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await supabase
        .from('ia_document_requests' as any)
        .update({ ...updates, updated_by: userCode || 'SYSTEM', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ia_document_requests'] });
      toast({ title: 'Updated', description: 'Document request updated.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return { create, update };
}
