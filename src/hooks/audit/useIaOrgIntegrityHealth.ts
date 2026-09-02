import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Stage 2D (DEF-E2E-011) — Department / Function referential integrity checks
 * for Configuration Health. Read-only diagnostics; the database triggers and
 * foreign keys remain authoritative.
 *
 * A live broken relationship is CRITICAL. A relationship that is merely
 * historical (deactivated master, closed work) is reported as HISTORICAL so
 * tolerated legacy never masquerades as a live PASS.
 */
export interface IaOrgIntegrityCheck {
  check_code: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'HISTORICAL';
  affected_count: number;
  detail: string;
}

const sb = supabase as any;
const TERMINAL = new Set(['Closed', 'Cancelled', 'Completed']);

async function loadOrgIntegrityHealth(): Promise<IaOrgIntegrityCheck[]> {
  const [{ data: engRows }, { data: deptRows }, { data: fnRows }] = await Promise.all([
    sb.from('ia_audit_engagements').select('id, engagement_code, department_id, function_id, status'),
    sb.from('ia_departments').select('id, name, is_active, head_profile_id'),
    sb.from('ia_department_functions').select('id, function_name, department_id, is_active'),
  ]);

  const engagements: any[] = engRows || [];
  const departments: any[] = deptRows || [];
  const functions: any[] = fnRows || [];

  const deptById = new Map(departments.map(d => [d.id, d]));
  const fnById = new Map(functions.map(f => [f.id, f]));
  const isLive = (e: any) => !TERMINAL.has(e.status);

  const deptOrphans = engagements.filter(e => e.department_id && !deptById.has(e.department_id));
  const liveDeptOrphans = deptOrphans.filter(isLive);
  const fnOrphans = engagements.filter(e => e.function_id && !fnById.has(e.function_id));
  const liveFnOrphans = fnOrphans.filter(isLive);
  const mismatches = engagements.filter(e => {
    const f = e.function_id ? fnById.get(e.function_id) : null;
    return f && f.department_id !== e.department_id;
  });
  const liveMismatches = mismatches.filter(isLive);
  const inactiveDeptRefs = engagements.filter(e => {
    const d = e.department_id ? deptById.get(e.department_id) : null;
    return d && d.is_active !== true;
  });
  const fnMissingDept = functions.filter(f => f.department_id && !deptById.has(f.department_id));
  const activeFnInactiveDept = functions.filter(f => {
    const d = f.department_id ? deptById.get(f.department_id) : null;
    return f.is_active === true && d && d.is_active !== true;
  });
  const deptNoHead = departments.filter(d => d.is_active === true && !d.head_profile_id);

  const list = (rows: any[], key = 'engagement_code') =>
    rows.slice(0, 5).map(r => r[key] || r.id).join(', ');

  return [
    {
      check_code: 'IA-ORG-01',
      title: 'Live engagement referencing a non-existent Department',
      severity: 'CRITICAL',
      status: liveDeptOrphans.length === 0 ? 'PASS' : 'FAIL',
      affected_count: liveDeptOrphans.length,
      detail: liveDeptOrphans.length === 0
        ? 'Foreign key ia_audit_engagements_department_id_fkey blocks new orphans.'
        : `Orphan: ${list(liveDeptOrphans)}`,
    },
    {
      check_code: 'IA-ORG-02',
      title: 'Terminal/historical engagement with an unresolvable Department',
      severity: 'INFO',
      status: deptOrphans.length - liveDeptOrphans.length === 0 ? 'PASS' : 'HISTORICAL',
      affected_count: deptOrphans.length - liveDeptOrphans.length,
      detail: deptOrphans.length > liveDeptOrphans.length
        ? `Tolerated historical exception (no provable canonical Department): ${list(deptOrphans.filter(e => !isLive(e)))}. Not repaired — see Stage 2D evidence.`
        : 'No historical department exceptions.',
    },
    {
      check_code: 'IA-ORG-03',
      title: 'Engagement referencing a non-existent Function',
      severity: 'CRITICAL',
      status: fnOrphans.length === 0 ? 'PASS' : liveFnOrphans.length ? 'FAIL' : 'HISTORICAL',
      affected_count: fnOrphans.length,
      detail: fnOrphans.length === 0 ? 'No orphan function references.' : `Orphan: ${list(fnOrphans)}`,
    },
    {
      check_code: 'IA-ORG-04',
      title: 'Function paired with the wrong parent Department',
      severity: 'CRITICAL',
      status: mismatches.length === 0 ? 'PASS' : liveMismatches.length ? 'FAIL' : 'HISTORICAL',
      affected_count: mismatches.length,
      detail: mismatches.length === 0
        ? 'Enforced server-side by ia_engagement_org_ref_guard (IA_INVALID_FUNCTION_PARENT).'
        : `Mismatched: ${list(mismatches)}`,
    },
    {
      check_code: 'IA-ORG-05',
      title: 'Function whose parent Department no longer exists',
      severity: 'CRITICAL',
      status: fnMissingDept.length === 0 ? 'PASS' : 'FAIL',
      affected_count: fnMissingDept.length,
      detail: fnMissingDept.length === 0
        ? 'ia_department_functions_department_id_fkey enforced.'
        : `Functions: ${list(fnMissingDept, 'function_name')}`,
    },
    {
      check_code: 'IA-ORG-06',
      title: 'Active Function under an inactive Department',
      severity: 'WARNING',
      status: activeFnInactiveDept.length === 0 ? 'PASS' : 'FAIL',
      affected_count: activeFnInactiveDept.length,
      detail: activeFnInactiveDept.length === 0
        ? 'No active function hangs off a deactivated department.'
        : `Deactivate or re-home: ${list(activeFnInactiveDept, 'function_name')}`,
    },
    {
      check_code: 'IA-ORG-07',
      title: 'Engagements referencing an inactive Department (historical readability)',
      severity: 'INFO',
      status: inactiveDeptRefs.length === 0 ? 'PASS' : 'HISTORICAL',
      affected_count: inactiveDeptRefs.length,
      detail: 'Old records keep their historical organisational meaning; inactive references cannot be chosen for new work.',
    },
    {
      check_code: 'IA-ORG-08',
      title: 'Active auditable Department without a resolvable Department Head',
      severity: 'WARNING',
      status: deptNoHead.length === 0 ? 'PASS' : 'FAIL',
      affected_count: deptNoHead.length,
      detail: deptNoHead.length === 0
        ? 'Every active department has a head profile.'
        : `Missing head: ${list(deptNoHead, 'name')}`,
    },
  ];
}

export function useIaOrgIntegrityHealth() {
  return useQuery({
    queryKey: ['ia', 'org-integrity', 'health'],
    queryFn: loadOrgIntegrityHealth,
    staleTime: 60_000,
  });
}
