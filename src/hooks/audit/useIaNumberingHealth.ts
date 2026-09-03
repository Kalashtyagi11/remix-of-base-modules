import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Stage 2C (DEF-E2E-009) — Configuration Health checks for authoritative
 * Internal Audit numbering. Read-only diagnostics; the database remains
 * authoritative. Historical (tolerated) data is reported separately from
 * new-invalid data so certified history is never treated as a blocker.
 */
export interface IaNumberingCheck {
  check_code: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'HISTORICAL';
  affected_count: number;
  detail: string;
}

/** Canonical format issued by INTERNAL_AUDIT/ENGAGEMENT. */
const CANONICAL = /^IA-ENG-SKN-\d{4}-\d{6}$/;
/** Documented legacy duplicate retained as evidence (never renumbered). */
const LEGACY_DUPLICATE_EXCEPTION = 'ENG-2026-2027-001';
/** Stage 2C cutover: engagements created from this date must be canonical. */
const CUTOVER = '2026-09-03';

const sb = supabase as any;

async function loadNumberingHealth(): Promise<IaNumberingCheck[]> {
  const checks: IaNumberingCheck[] = [];

  const { data: seqRows } = await sb
    .from('core_number_sequence')
    .select('module_code, entity_type, number_pattern, is_active')
    .eq('module_code', 'INTERNAL_AUDIT')
    .eq('entity_type', 'ENGAGEMENT');

  const seq = (seqRows || [])[0];
  checks.push({
    check_code: 'IA-NUM-01',
    title: 'Engagement numbering sequence registered and active',
    severity: 'CRITICAL',
    status: seq?.is_active ? 'PASS' : 'FAIL',
    affected_count: seq?.is_active ? 0 : 1,
    detail: seq
      ? `INTERNAL_AUDIT/ENGAGEMENT → ${seq.number_pattern} (${seq.is_active ? 'active' : 'INACTIVE'})`
      : 'No INTERNAL_AUDIT/ENGAGEMENT sequence exists in the central numbering configuration.',
  });

  const { data: engagements } = await sb
    .from('ia_audit_engagements')
    .select('engagement_code, created_at');

  const rows: Array<{ engagement_code: string | null; created_at: string | null }> = engagements || [];

  const counts = new Map<string, number>();
  rows.forEach(r => {
    if (!r.engagement_code) return;
    counts.set(r.engagement_code, (counts.get(r.engagement_code) || 0) + 1);
  });
  const duplicates = [...counts.entries()].filter(([code, n]) => n > 1 && code !== LEGACY_DUPLICATE_EXCEPTION);
  const legacyDup = counts.get(LEGACY_DUPLICATE_EXCEPTION) || 0;

  checks.push({
    check_code: 'IA-NUM-02',
    title: 'Duplicate engagement codes (excluding documented legacy exception)',
    severity: 'CRITICAL',
    status: duplicates.length === 0 ? 'PASS' : 'FAIL',
    affected_count: duplicates.length,
    detail: duplicates.length === 0
      ? 'Uniqueness enforced by database index ia_audit_engagements_code_uq.'
      : `Duplicated: ${duplicates.map(([c]) => c).join(', ')}`,
  });

  if (legacyDup > 1) {
    checks.push({
      check_code: 'IA-NUM-03',
      title: 'Legacy duplicate engagement code retained as historical evidence',
      severity: 'INFO',
      status: 'HISTORICAL',
      affected_count: legacyDup,
      detail: `${LEGACY_DUPLICATE_EXCEPTION} pre-dates central numbering and is intentionally not renumbered.`,
    });
  }

  const missing = rows.filter(r => !r.engagement_code || !r.engagement_code.trim());
  checks.push({
    check_code: 'IA-NUM-04',
    title: 'Engagements without an authoritative code',
    severity: 'CRITICAL',
    status: missing.length === 0 ? 'PASS' : 'FAIL',
    affected_count: missing.length,
    detail: missing.length === 0 ? 'engagement_code is NOT NULL and server-allocated.' : 'Rows found with an empty code.',
  });

  const newNonCanonical = rows.filter(
    r => (r.created_at || '') >= CUTOVER && !CANONICAL.test(r.engagement_code || ''),
  );
  checks.push({
    check_code: 'IA-NUM-05',
    title: 'Post-cutover engagements not using the canonical numbering format',
    severity: 'CRITICAL',
    status: newNonCanonical.length === 0 ? 'PASS' : 'FAIL',
    affected_count: newNonCanonical.length,
    detail: newNonCanonical.length === 0
      ? `All engagements created on/after ${CUTOVER} carry a central-engine code.`
      : `Non-canonical: ${newNonCanonical.slice(0, 5).map(r => r.engagement_code).join(', ')}`,
  });

  const legacyFormat = rows.filter(
    r => (r.created_at || '') < CUTOVER && !CANONICAL.test(r.engagement_code || ''),
  );
  checks.push({
    check_code: 'IA-NUM-06',
    title: 'Historical engagement codes predating central numbering',
    severity: 'INFO',
    status: 'HISTORICAL',
    affected_count: legacyFormat.length,
    detail: 'Preserved unchanged, including the closed FY2032 plan. Reported, never rewritten.',
  });

  return checks;
}

export function useIaNumberingHealth() {
  return useQuery({
    queryKey: ['ia', 'numbering', 'health'],
    queryFn: loadNumberingHealth,
    staleTime: 60_000,
  });
}
