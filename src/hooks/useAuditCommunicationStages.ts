/**
 * Hooks for IA Communication Stages, Template Policy, and Carry-Forward.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============= Communication Timeline =============

export interface CommunicationStageEntry {
  id: string;
  sent_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  template_name: string | null;
  delivery_status: string;
  acknowledged_at: string | null;
  acknowledgment_required: boolean;
  notes: string | null;
}

export interface CommunicationStage {
  stage_code: string;
  stage_order: number;
  is_mandatory: boolean;
  completed: boolean;
  acknowledged: boolean;
  entries: CommunicationStageEntry[];
}

export function useCommunicationTimeline(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_communication_timeline', engagementId],
    queryFn: async (): Promise<CommunicationStage[]> => {
      const { data, error } = await supabase.rpc('ia_get_communication_timeline' as any, {
        p_engagement_id: engagementId!,
      });
      if (error) throw error;
      return (data as unknown as CommunicationStage[]) || [];
    },
    enabled: !!engagementId,
  });
}

// ============= Record Communication Stage =============

export function useRecordCommunicationStage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_communication_stages', 'mutation'],
    mutationFn: async (params: {
      engagementId: string;
      stageCode: string;
      templateId?: string;
      recipientName?: string;
      recipientEmail?: string;
      notes?: string;
      createdBy?: string;
      acknowledgmentRequired?: boolean;
      mode?: 'send' | 'resend' | 'reminder';
      /** Omni-Comms evidence link (DEF-E3B-004): proves real governed delivery. */
      eventCode?: string | null;
      omniCommsRequestId?: string | null;
      occurrence?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('ia_record_communication_stage' as any, {
        p_engagement_id: params.engagementId,
        p_stage_code: params.stageCode,
        p_template_id: params.templateId || null,
        p_recipient_name: params.recipientName || null,
        p_recipient_email: params.recipientEmail || null,
        p_notes: params.notes || null,
        p_created_by: params.createdBy || null,
        p_acknowledgment_required: params.acknowledgmentRequired || false,
        p_mode: params.mode || 'send',
        p_event_code: params.eventCode || null,
        p_omni_comms_request_id: params.omniCommsRequestId || null,
        p_occurrence: params.occurrence || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Failed to record stage');
      return result;
    },
    onSuccess: (result, params) => {
      queryClient.invalidateQueries({ queryKey: ['ia_communication_timeline', params.engagementId] });
      const modeLabel = params.mode === 'reminder' ? 'Reminder Sent' : params.mode === 'resend' ? 'Communication Resent' : 'Communication Sent';
      toast({ title: modeLabel, description: `Stage ${formatStageCode(params.stageCode)} recorded successfully.` });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Acknowledge Stage =============

export function useAcknowledgeStage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_communication_stages', 'update'],
    mutationFn: async (params: { stageId: string; engagementId: string }) => {
      const { error } = await supabase
        .from('ia_communication_stages' as any)
        .update({ acknowledged_at: new Date().toISOString(), delivery_status: 'Acknowledged' })
        .eq('id', params.stageId);
      if (error) throw error;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['ia_communication_timeline', params.engagementId] });
      toast({ title: 'Acknowledged', description: 'Stage acknowledgment recorded.' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Template Policy Validation =============

export function useValidateTemplatePolicy() {
  return useMutation({
    mutationKey: ['InternalAudit', 'ia_communication_stages', 'mutation'],
    mutationFn: async (params: { stageCode: string; templateId: string }) => {
      const { data, error } = await supabase.rpc('ia_validate_template_policy' as any, {
        p_stage_code: params.stageCode,
        p_template_id: params.templateId,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

// ============= Template Policy Matrix =============

export function useTemplatePolicyMatrix() {
  return useQuery({
    queryKey: ['ia_template_policy_matrix'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ia_template_policy_matrix' as any)
        .select('*')
        .eq('is_active', true)
        .order('stage_code');
      if (error) throw error;
      return data as any[];
    },
  });
}

// ============= Carry-Forward =============

export function useCarryForwardItems(targetYear?: string) {
  return useQuery({
    queryKey: ['ia_carry_forward', targetYear],
    queryFn: async () => {
      let q = supabase.from('ia_plan_carry_forward' as any).select('*').order('created_at', { ascending: false });
      if (targetYear) q = q.eq('target_fiscal_year', targetYear);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useBuildCarryForward() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_communication_stages', 'mutation'],
    mutationFn: async (params: { sourceYear: string; targetYear: string; carriedBy?: string }) => {
      const { data, error } = await supabase.rpc('ia_build_followup_carry_forward' as any, {
        p_source_fiscal_year: params.sourceYear,
        p_target_fiscal_year: params.targetYear,
        p_carried_by: params.carriedBy || null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ia_carry_forward'] });
      toast({ title: 'Carry-Forward Complete', description: `${result?.carried_forward_count || 0} findings carried forward.` });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Closure Gate =============

export interface ClosureGateResult {
  can_close: boolean;
  reasons: string[];
}

export function useCanCloseEngagement(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_can_close_engagement', engagementId],
    queryFn: async (): Promise<ClosureGateResult> => {
      const { data, error } = await supabase.rpc('ia_can_close_engagement' as any, {
        p_engagement_id: engagementId!,
      });
      if (error) throw error;
      return data as unknown as ClosureGateResult;
    },
    enabled: !!engagementId,
  });
}

// ============= Overdue Check =============

export function useCheckOverdueActions() {
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['InternalAudit', 'ia_communication_stages', 'mutation'],
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ia_check_overdue_actions' as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      toast({ title: 'Overdue Check Complete', description: `${result?.overdue_count || 0} overdue items found.` });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

// ============= Helpers =============

export function formatStageCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const STAGE_LABELS: Record<string, string> = {
  PLAN_INTIMATION: 'Audit Intimation',
  TEAM_AND_SCOPE_NOTICE: 'Team & Scope Notice',
  DOC_REQUEST: 'Document Request',
  ENTRANCE_MEETING: 'Entrance Meeting',
  QUERY_CYCLE: 'Query / Clarification',
  DRAFT_FINDING_DISCUSSION: 'Draft Finding Discussion',
  EXIT_MEETING: 'Exit Meeting',
  FINAL_REPORT_ISSUE: 'Final Report Issuance',
  ACTION_PLAN_REMINDER: 'Action Plan Reminder',
};
