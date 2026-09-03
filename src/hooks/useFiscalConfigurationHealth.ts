import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type HealthSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type HealthStatus = 'PASS' | 'FAIL' | 'HISTORICAL';

export interface FiscalHealthCheck {
  check_code: string;
  title: string;
  severity: HealthSeverity;
  status: HealthStatus;
  affected_count: number;
  detail: string;
  drill_ref: string;
}

/**
 * Live fiscal configuration diagnostics (Stage 2A).
 * Read-only: the screen never repairs data, it only surfaces blockers early.
 */
export function useFiscalConfigurationHealth() {
  return useQuery({
    queryKey: ['ia-fiscal-configuration-health'],
    queryFn: async (): Promise<FiscalHealthCheck[]> => {
      const { data, error } = await supabase.rpc('ia_fiscal_configuration_health' as any);
      if (error) throw error;
      return (data || []) as unknown as FiscalHealthCheck[];
    },
    staleTime: 30_000,
  });
}
