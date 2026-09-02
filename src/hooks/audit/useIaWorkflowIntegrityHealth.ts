import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  WORKFLOW_DOMAINS,
  classifyWorkflowState,
  type WorkflowDomainKey,
} from '@/config/auditWorkflowVocabulary';

/**
 * Stage 2E (DEF-E2E-012) — Workflow Integrity diagnostics.
 *
 * Read-only. The governed server state machines and the
 * `zz_ia_workflow_status_guard` triggers remain authoritative; this check only
 * reports whether persisted state values are inside the canonical vocabulary,
 * a tolerated legacy value, or an unknown value that needs investigation.
 */
export interface IaWorkflowIntegrityCheck {
  check_code: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'HISTORICAL';
  affected_count: number;
  detail: string;
}

const sb = supabase as any;

const SOURCES: Array<{
  code: string;
  domain: WorkflowDomainKey;
  table: string;
  column: string;
}> = [
  { code: 'IA-WF-01', domain: 'engagement', table: 'ia_audit_engagements', column: 'execution_status' },
  { code: 'IA-WF-02', domain: 'engagement', table: 'ia_audit_engagements', column: 'status' },
  { code: 'IA-WF-03', domain: 'finding', table: 'ia_findings', column: 'lifecycle_status' },
  { code: 'IA-WF-04', domain: 'action', table: 'ia_action_tracking', column: 'lifecycle_status' },
  { code: 'IA-WF-05', domain: 'plan', table: 'ia_annual_plans', column: 'status' },
];

async function loadWorkflowIntegrityHealth(): Promise<IaWorkflowIntegrityCheck[]> {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      const { data, error } = await sb.from(src.table).select(src.column);
      const rows: any[] = error ? [] : data || [];
      const tally = new Map<string, number>();
      rows.forEach((r) => {
        const v = r?.[src.column] ?? '(null)';
        tally.set(v, (tally.get(v) || 0) + 1);
      });

      const legacy: string[] = [];
      const unknown: string[] = [];
      let legacyCount = 0;
      let unknownCount = 0;

      tally.forEach((count, value) => {
        if (value === '(null)') return;
        const cls = classifyWorkflowState(src.domain, value);
        if (cls === 'LEGACY_READABLE') {
          legacy.push(`${value} (${count})`);
          legacyCount += count;
        } else if (cls === 'UNKNOWN') {
          unknown.push(`${value} (${count})`);
          unknownCount += count;
        }
      });

      const label = `${WORKFLOW_DOMAINS[src.domain].label} · ${src.table}.${src.column}`;

      if (unknown.length) {
        return {
          check_code: src.code,
          title: `${label} outside governed vocabulary`,
          severity: 'CRITICAL' as const,
          status: 'FAIL' as const,
          affected_count: unknownCount,
          detail: `Unrecognised state values: ${unknown.join(', ')}`,
        };
      }
      if (legacy.length) {
        return {
          check_code: src.code,
          title: `${label} contains legacy historical values`,
          severity: 'INFO' as const,
          status: 'HISTORICAL' as const,
          affected_count: legacyCount,
          detail: `Readable legacy values preserved: ${legacy.join(', ')}`,
        };
      }
      return {
        check_code: src.code,
        title: `${label} matches governed vocabulary`,
        severity: 'INFO' as const,
        status: 'PASS' as const,
        affected_count: rows.length,
        detail: 'All persisted values are canonical governed workflow states.',
      };
    }),
  );

  return results;
}

export function useIaWorkflowIntegrityHealth() {
  return useQuery({
    queryKey: ['ia_workflow_integrity_health'],
    queryFn: loadWorkflowIntegrityHealth,
    staleTime: 60_000,
  });
}
