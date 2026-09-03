import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuditFields } from '@/hooks/useAuditTrail';

export function useEngagementClosure(engagementId?: string) {
  return useQuery({
    queryKey: ['ia_engagement_closure', engagementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ia_engagement_closure' as any)
        .select('*')
        .eq('engagement_id', engagementId!)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
    enabled: !!engagementId,
  });
}

export function useEngagementClosureMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getCreateFields, getUpdateFields } = useAuditFields();

  const upsert = useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_closure', 'create'],
    mutationFn: async (record: any) => {
      // Check if closure record exists
      const { data: existing } = await supabase
        .from('ia_engagement_closure' as any)
        .select('id')
        .eq('engagement_id', record.engagement_id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('ia_engagement_closure' as any)
          .update({ ...record, ...getUpdateFields() })
          .eq('id', (existing as any).id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('ia_engagement_closure' as any)
          .insert({ ...record, ...getCreateFields() })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ia_engagement_closure'] });
      toast({ title: 'Closure Updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return { upsert };
}

/**
 * Stage 2E (DEF-E2E-012): engagement lifecycle progression.
 *
 * `lifecycle_status` is a non-authoritative UI progress marker. Any terminal
 * disposition ("Completed"/"Closed") MUST go through the governed closure
 * command `ia_close_engagement` — the client never writes a terminal state.
 */
export function useEngagementLifecycle() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getUpdateFields } = useAuditFields();

  const transition = useMutation({
    mutationKey: ['InternalAudit', 'ia_audit_closure', 'update'],
    mutationFn: async ({
      engagementId,
      status,
      finalRating,
      notes,
    }: { engagementId: string; status: string; finalRating?: string | null; notes?: string | null }) => {
      const terminal = ['Completed', 'Closed', 'Closed – Actions Pending'].includes(status);

      if (terminal) {
        const { data, error } = await (supabase.rpc as any)('ia_close_engagement', {
          p_engagement_id: engagementId,
          p_disposition: status === 'Closed – Actions Pending' ? 'Closed – Actions Pending' : 'Closed',
          p_final_rating: finalRating ?? null,
          p_notes: notes ?? null,
        });
        if (error) throw error;
        const result = data as any;
        if (!result?.success) {
          const detail: string[] = (result?.blockers || []).map((b: any) => b?.message).filter(Boolean);
          throw new Error([result?.error, ...detail].filter(Boolean).join(' — '));
        }
        return result;
      }

      const { data, error } = await supabase
        .from('ia_audit_engagements' as any)
        .update({ lifecycle_status: status, ...getUpdateFields() } as any)
        .eq('id', engagementId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['ia_audit_engagements'] });
      qc.invalidateQueries({ queryKey: ['ia_engagement_closure_gate'] });
      toast({ title: `Status: ${vars.status}`, description: 'Engagement lifecycle updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });


  return { transition };
}
