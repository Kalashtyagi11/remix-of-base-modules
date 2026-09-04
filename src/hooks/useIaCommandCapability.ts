import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Client-side mirror of the server command guard.
 *
 * The server (`ia_cmd_guard` / `ia_cmd_guard_elevated`) remains the only
 * authority — this hook exists purely so the UI does not offer governed
 * actions to personas that the server will reject (e.g. showing "Accept /
 * Request revision / Escalate" to a Management Respondent).
 */
export function useIaCommandCapability(
  module: string,
  action: string,
  engagementId?: string,
  elevated = false,
) {
  return useQuery({
    queryKey: ['ia-cmd-capability', module, action, engagementId, elevated],
    enabled: !!engagementId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const fn = elevated ? 'ia_cmd_guard_elevated' : 'ia_cmd_guard';
      const { data, error } = await supabase.rpc(fn as any, {
        _module: module,
        _action: action,
        _engagement: engagementId,
      } as any);
      if (error) return false;
      return data === true;
    },
  });
}
