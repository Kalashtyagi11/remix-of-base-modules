import { routeClaimAfterStatusChange } from '@/services/bn/workflow/routeClaimAfterStatusChange';
import { supabase } from '@/integrations/supabase/client';
import { isEvidenceComplete } from '@/services/bn/evidenceService';
import { expandAllowedRoles, userHoldsAllowedRole } from '@/services/bn/roleVocabulary';

import type {
  BnClaimTransitionRule,
  BnAvailableAction,
  BnClaimDecision,
  BnReasonCode,
} from '@/types/bn';

const db = supabase as any;

// ── Fetch available transitions for a claim ──

export async function getAvailableTransitions(
  claimId: string,
  userRoles: string[],
  productCategory?: string | null,
  countryCode?: string | null
): Promise<BnAvailableAction[]> {
  // 1. Get claim current status + evidence/eligibility/calc state
  const { data: claim, error: claimErr } = await db
    .from('bn_claim')
    .select('id, status, product_id')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) throw new Error('Claim not found');

  const currentStatus = claim.status as string;

  // 2. Fetch all active transition rules from this status
  let query = db
    .from('bn_claim_transition_rule')
    .select('*')
    .eq('from_status', currentStatus)
    .eq('is_active', true)
    .order('sort_order');

  const { data: rules, error: rulesErr } = await query;
  if (rulesErr) throw rulesErr;

  // 3. Check preconditions in parallel
  const [eligResults, calcResults, evidenceComplete, awardResults] = await Promise.all([
    db.from('bn_claim_eligibility').select('overall_result').eq('claim_id', claimId).order('check_date', { ascending: false }).limit(1),
    db.from('bn_claim_calculation').select('id').eq('claim_id', claimId).limit(1),
    isEvidenceComplete(claimId),
    db.from('bn_award').select('id').eq('bn_claim_id', claimId).limit(1),
  ]);

  const hasEligibilityPass = eligResults.data?.[0]?.overall_result === true;
  const hasCalculation = (calcResults.data?.length || 0) > 0;
  const hasAward = (awardResults.data?.length || 0) > 0;


  // 4. Evaluate each rule
  return (rules || []).map((rule: BnClaimTransitionRule) => {
    // Role check — case-insensitive, legacy-alias tolerant, Admin bypass.
    if (!userHoldsAllowedRole(userRoles, rule.allowed_roles)) {
      return {
        rule,
        blocked: true,
        blockedReason: `Restricted to: ${expandAllowedRoles(rule.allowed_roles).join(', ')}`,
      };
    }


    // Product category filter
    if (rule.product_category && productCategory && rule.product_category !== productCategory) {
      return null; // Not applicable
    }

    // Country filter
    if (rule.country_code && countryCode && rule.country_code !== countryCode) {
      return null;
    }

    // Precondition checks
    if (rule.requires_eligibility_pass && !hasEligibilityPass) {
      return { rule, blocked: true, blockedReason: 'Eligibility check must pass first' };
    }
    if (rule.requires_calculation && !hasCalculation) {
      return { rule, blocked: true, blockedReason: 'Calculation must be completed first' };
    }
    if (rule.requires_evidence_complete && !evidenceComplete) {
      return { rule, blocked: true, blockedReason: 'All mandatory documents must be verified first' };
    }

    // Award Setup → Payment hand-off cannot happen without an award record:
    // the payment schedule is built from the award.
    if (rule.from_status === 'AWARD_SETUP' && rule.to_status === 'PAYMENT_QUEUE' && !hasAward) {
      return { rule, blocked: true, blockedReason: 'Award record must be created first' };
    }

    return { rule, blocked: false, blockedReason: null };
  }).filter(Boolean) as BnAvailableAction[];
}


// ── Execute a transition ──

export interface ExecuteTransitionParams {
  claimId: string;
  actionCode: string;
  ruleId: string;
  reasonCodeId?: string | null;
  narrative?: string | null;
  effectiveDate?: string | null;
  overrideId?: string | null;
  performedBy: string;
}

export async function executeTransition(params: ExecuteTransitionParams): Promise<BnClaimDecision> {
  const { claimId, actionCode, ruleId, reasonCodeId, narrative, effectiveDate, overrideId, performedBy } = params;

  // 1. Get current claim status
  const { data: claim, error: claimErr } = await db
    .from('bn_claim')
    .select('id, status')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) throw new Error('Claim not found');

  // 2. Get the transition rule
  const { data: rule, error: ruleErr } = await db
    .from('bn_claim_transition_rule')
    .select('*')
    .eq('id', ruleId)
    .single();

  if (ruleErr || !rule) throw new Error('Transition rule not found');

  // 2b. Re-check the caller's roles at execution time. The button state is a
  // convenience; this is the check that actually decides.
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData?.user?.id;
  if (!authUserId) throw new Error('You must be signed in to perform this action');
  const { data: roleRows } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', authUserId);
  const callerRoles = (roleRows || []).map((r: any) => String(r.role));
  if (!userHoldsAllowedRole(callerRoles, rule.allowed_roles)) {
    throw new Error(
      `You do not hold a role permitted for "${rule.action_label}". Restricted to: ${expandAllowedRoles(rule.allowed_roles).join(', ')}`,
    );
  }

  // 3. Validate current status matches
  if (claim.status !== rule.from_status) {
    throw new Error(`Claim status "${claim.status}" does not match expected "${rule.from_status}"`);
  }

  // 3a. Re-assert the rule's own preconditions. These used to decide button
  // state only, so anything reaching execution by another route — a stale
  // page, a direct call — transitioned without them. The button is a
  // convenience; this is the check that decides.
  if (rule.requires_eligibility_pass) {
    const { data: eligRows, error: eligErr } = await db
      .from('bn_claim_eligibility')
      .select('overall_result')
      .eq('claim_id', claimId)
      .order('check_date', { ascending: false })
      .limit(1);
    // An unreadable eligibility result is a refusal, not a pass.
    if (eligErr || eligRows?.[0]?.overall_result !== true) {
      throw new Error('Eligibility check must pass first');
    }
  }
  if (rule.requires_calculation) {
    const { data: calcRows, error: calcErr } = await db
      .from('bn_claim_calculation')
      .select('id')
      .eq('claim_id', claimId)
      .limit(1);
    if (calcErr || !calcRows || calcRows.length === 0) {
      throw new Error('Calculation must be completed first');
    }
  }
  if (rule.requires_evidence_complete && !(await isEvidenceComplete(claimId))) {
    throw new Error('All mandatory documents must be verified first');
  }





  // 3b. Award Setup → Payment Queue requires an award record.
  if (rule.from_status === 'AWARD_SETUP' && rule.to_status === 'PAYMENT_QUEUE') {
    const { data: awardRows } = await db
      .from('bn_award')
      .select('id')
      .eq('bn_claim_id', claimId)
      .limit(1);
    if (!awardRows || awardRows.length === 0) {
      throw new Error(
        'This claim has no award record, so a payment schedule cannot be generated. Create the award before sending it to Payment.',
      );
    }
  }

  // 4. Validate reason if required
  if (rule.requires_reason && !reasonCodeId) {
    throw new Error('A reason code is required for this action');
  }


  // 5. Validate narrative if required
  if (rule.requires_narrative && (!narrative || !narrative.trim())) {
    throw new Error('A narrative justification is required for this action');
  }

  // 6. Build evidence snapshot from bn_claim_evidence
  const { data: docs } = await db
    .from('bn_claim_evidence')
    .select('id, document_type_code, status, document_name')
    .eq('claim_id', claimId);

  const evidenceSnapshot = {
    documents: (docs || []).map((d: any) => ({
      id: d.id,
      type: d.document_type_code,
      name: d.document_name,
      status: d.status,
    })),
    snapshot_at: new Date().toISOString(),
  };

  // 7. Get latest eligibility & calculation IDs
  const { data: latestElig } = await db
    .from('bn_claim_eligibility')
    .select('id')
    .eq('claim_id', claimId)
    .order('check_date', { ascending: false })
    .limit(1);

  const { data: latestCalc } = await db
    .from('bn_claim_calculation')
    .select('id')
    .eq('claim_id', claimId)
    .order('calc_date', { ascending: false })
    .limit(1);

  // 8. Insert decision record
  const decisionRecord = {
    claim_id: claimId,
    transition_rule_id: ruleId,
    action_code: actionCode,
    from_status: rule.from_status,
    to_status: rule.to_status,
    reason_code_id: reasonCodeId || null,
    narrative: narrative || null,
    effective_date: effectiveDate || null,
    override_id: overrideId || null,
    evidence_snapshot: evidenceSnapshot,
    eligibility_snapshot_id: latestElig?.[0]?.id || null,
    calculation_snapshot_id: latestCalc?.[0]?.id || null,
    performed_by: performedBy,
  };

  const { data: decision, error: decisionErr } = await db
    .from('bn_claim_decision')
    .insert(decisionRecord)
    .select()
    .single();

  if (decisionErr) throw decisionErr;

  // 9. Update claim status
  const claimUpdate: Record<string, any> = {
    status: rule.to_status,
    modified_by: performedBy,
    modified_at: new Date().toISOString(),
  };

  if (actionCode === 'APPROVE') {
    claimUpdate.decision_date = new Date().toISOString();
  }

  const { error: updateErr } = await db
    .from('bn_claim')
    .update(claimUpdate)
    .eq('id', claimId);

  if (updateErr) throw updateErr;

  // The claim's new status decides which workbasket owns it next. Routing is
  // non-blocking, so its outcome is recorded on the claim event — otherwise a
  // basket that failed to move leaves no trace outside the browser console.
  const routing = await routeClaimAfterStatusChange(claimId, performedBy);

  // 10. Insert claim event
  await db.from('bn_claim_event').insert({
    claim_id: claimId,
    event_type: `STATUS_CHANGE_${actionCode}`,
    from_status: rule.from_status,
    to_status: rule.to_status,
    notes: narrative || rule.action_label,
    performed_by: performedBy,
    metadata: {
      decision_id: decision.id,
      reason_code_id: reasonCodeId,
      routing_outcome: routing?.outcome ?? 'NOT_ATTEMPTED',
      routing_reason: routing?.reason ?? 'Routing threw before returning a result.',
      routing_to_workbasket: routing?.workbasketName ?? null,
    },
  });


  return decision as BnClaimDecision;
}

// ── Fetch decisions for a claim ──

export async function fetchClaimDecisions(claimId: string): Promise<BnClaimDecision[]> {
  const { data, error } = await db
    .from('bn_claim_decision')
    .select('*, bn_reason_code(*)')
    .eq('claim_id', claimId)
    .order('performed_at', { ascending: false });

  if (error) throw error;
  return (data || []) as BnClaimDecision[];
}

// ── Fetch reason codes for an action ──

export async function fetchReasonCodesForAction(actionCode: string): Promise<BnReasonCode[]> {
  const { data, error } = await db
    .from('bn_reason_code')
    .select('*')
    .eq('is_active', true)
    .contains('applicable_actions', [actionCode])
    .order('reason_label');

  if (error) throw error;
  return (data || []) as BnReasonCode[];
}

// ── Export decisions as JSON ──

export async function exportDecisionAudit(claimId: string) {
  const decisions = await fetchClaimDecisions(claimId);

  // Get eligibility and calculation snapshots
  const { data: eligibility } = await db
    .from('bn_claim_eligibility')
    .select('*')
    .eq('claim_id', claimId)
    .order('check_date', { ascending: false });

  const { data: calculations } = await db
    .from('bn_claim_calculation')
    .select('*')
    .eq('claim_id', claimId)
    .order('calc_date', { ascending: false });

  return {
    claim_id: claimId,
    exported_at: new Date().toISOString(),
    decisions,
    eligibility_snapshots: eligibility || [],
    calculation_snapshots: calculations || [],
  };
}
