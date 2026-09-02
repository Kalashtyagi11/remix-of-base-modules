/**
 * Payment Boundary Service
 * ------------------------
 * Enforces the BN ↔ Finance/Cashier separation of concerns.
 *
 * BN owns INTENT:
 *   bn_award  →  bn_payment_schedule  →  bn_payment_instruction
 *
 * Finance/Cashier owns EXECUTION (via the existing paymentIssueService and the
 * legacy `cl_cheques*` tables for historical payments). BN pages MUST NOT
 * write to `cl_cheques*` directly — they may only read legacy payments
 * through `historicalInquiryAdapter`.
 *
 * Public surface:
 *   - createAwardFromApprovedClaim(claimId, performedBy)
 *   - createScheduleFromAward(awardId, performedBy)
 *   - createInstructionsFromDueSchedule(awardId|scheduleId, performedBy)
 *   - getUnifiedPaymentsForClaim({ bnClaimId? , sourceClaimNumber?, sourceClaimSeq? })
 *   - getUnifiedPaymentsBySsn(ssn)
 *
 * Each unified payment carries a `source` discriminator used by UI badges:
 *   'LEGACY_CHEQUE'    → from cl_cheques (read-only)
 *   'BN_INSTRUCTION'   → from bn_payment_instruction (BN intent)
 */

import { supabase } from '@/integrations/supabase/client';
import { historicalInquiryAdapter } from '@/services/bn/integration/historicalInquiryAdapter';

const db = supabase as any;

// ─── Types ──────────────────────────────────────────────────────────

export type PaymentSource = 'LEGACY_CHEQUE' | 'BN_INSTRUCTION';

export interface UnifiedPaymentRow {
  source: PaymentSource;
  sourceBadge: 'Legacy Cheque' | 'BN Instruction';
  id: string;
  reference: string | null;
  amount: number | null;
  currency: string;
  date: string | null;
  status: string | null;
  voided?: boolean;
  bank_account?: string | null;
  claim_ref?: string | null;
  raw?: unknown;
}

export interface CreateAwardInput {
  claimId: string;
  performedBy: string;
}

export interface CreateAwardResult {
  awardId: string;
  created: boolean;
}

// ─── 1) Award creation from approved BN claim ───────────────────────

/**
 * Single award-creation path.
 *
 * This used to insert into `bn_award` itself, selecting `bn_product_id`,
 * `benefit_code` and `claim_date` from `bn_claim` — two of which do not exist
 * on that table, so every call failed its select and returned `null`. It now
 * delegates to `createAwardOnApproval`, which is the one implementation that
 * also provisions the first schedule row, survivor beneficiaries, the life
 * certificate and the medical review.
 */
export async function createAwardFromApprovedClaim(
  input: CreateAwardInput & { force?: boolean; source?: string },
): Promise<CreateAwardResult | null> {
  const { claimId, performedBy, force, source } = input;
  const { createAwardOnApproval } = await import('@/services/bn/awards/awardCreationService');
  const result = await createAwardOnApproval(claimId, performedBy, { force, source });
  if (!result.awardId) return null;
  return { awardId: result.awardId, created: result.created };
}


// ─── 2) Schedule creation from award ────────────────────────────────

export async function createScheduleFromAward(
  awardId: string,
  performedBy: string,
): Promise<{ scheduleIds: string[] }> {
  const { data: award } = await db
    .from('bn_award')
    .select('id, award_type, base_amount, currency, start_date, frequency')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { scheduleIds: [] };

  // Idempotent: skip if schedules already exist.
  const { data: existing } = await db
    .from('bn_payment_schedule')
    .select('id')
    .eq('bn_award_id', awardId)
    .limit(1);
  if (existing?.length) return { scheduleIds: existing.map((r: any) => r.id) };

  const period = award.start_date ?? new Date().toISOString().slice(0, 10);
  const dueDate = period;

  const { data: inserted, error } = await db
    .from('bn_payment_schedule')
    .insert({
      bn_award_id: awardId,
      schedule_period: period,
      due_date: dueDate,
      gross_amount: award.base_amount ?? 0,
      net_amount: award.base_amount ?? 0,
      deductions: 0,
      status: 'PENDING',
      entered_by: performedBy,
      modified_by: performedBy,
    })
    .select('id');

  if (error) return { scheduleIds: [] };
  return { scheduleIds: (inserted ?? []).map((r: any) => r.id) };
}

// ─── 3) Instruction creation from due schedule rows ─────────────────

export async function createInstructionsFromDueSchedule(
  awardId: string,
  performedBy: string,
): Promise<{ instructionIds: string[] }> {
  const { data: award } = await db
    .from('bn_award')
    .select('id, bn_claim_id, ssn, currency, frequency')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { instructionIds: [] };

  const { data: due } = await db
    .from('bn_payment_schedule')
    .select('id, schedule_period, due_date, net_amount, gross_amount, bn_payment_instruction_id')
    .eq('bn_award_id', awardId)
    .eq('status', 'PENDING')
    .is('bn_payment_instruction_id', null);

  const ids: string[] = [];
  for (const row of due ?? []) {
    const amount = row.net_amount ?? row.gross_amount ?? 0;
    const { data: instr, error } = await db
      .from('bn_payment_instruction')
      .insert({
        award_id: award.id,
        claim_id: award.bn_claim_id,
        ssn: award.ssn,
        amount,
        currency: award.currency || 'XCD',
        payment_method: 'EFT',
        due_date: row.due_date,
        frequency: award.frequency || 'one_off',
        status: 'queued',
        description: `Schedule ${row.schedule_period}`,
      })
      .select('id')
      .maybeSingle();
    if (error || !instr) continue;
    ids.push(instr.id);
    await db
      .from('bn_payment_schedule')
      .update({
        bn_payment_instruction_id: instr.id,
        status: 'INSTRUCTED',
        modified_by: performedBy,
      })
      .eq('id', row.id);
  }
  return { instructionIds: ids };
}

/**
 * End-to-end convenience: approval handlers can call this single function to
 * spin up the intent chain.
 */
export async function provisionPaymentIntent(
  claimId: string,
  performedBy: string,
): Promise<{ awardId: string | null; scheduleIds: string[]; instructionIds: string[] }> {
  const award = await createAwardFromApprovedClaim({ claimId, performedBy });
  if (!award) return { awardId: null, scheduleIds: [], instructionIds: [] };
  const sched = await createScheduleFromAward(award.awardId, performedBy);
  const instr = await createInstructionsFromDueSchedule(award.awardId, performedBy);
  return { awardId: award.awardId, scheduleIds: sched.scheduleIds, instructionIds: instr.instructionIds };
}

// ─── 4) Unified payment readers (legacy + BN) ───────────────────────

function mapBnInstruction(row: any): UnifiedPaymentRow {
  return {
    source: 'BN_INSTRUCTION',
    sourceBadge: 'BN Instruction',
    id: row.id,
    reference: row.payment_reference ?? null,
    amount: row.amount ?? null,
    currency: row.currency || 'XCD',
    date: row.paid_date ?? row.due_date ?? null,
    status: row.status ?? null,
    bank_account: row.account_number ?? null,
    claim_ref: row.claim_id ?? null,
    raw: row,
  };
}

export async function getUnifiedPaymentsForClaim(input: {
  bnClaimId?: string | null;
  sourceClaimNumber?: string | null;
  sourceClaimSeq?: number | null;
}): Promise<UnifiedPaymentRow[]> {
  const out: UnifiedPaymentRow[] = [];

  if (input.bnClaimId) {
    const { data } = await db
      .from('bn_payment_instruction')
      .select('*')
      .eq('claim_id', input.bnClaimId)
      .order('due_date', { ascending: false });
    for (const r of data ?? []) out.push(mapBnInstruction(r));
  }

  if (input.sourceClaimNumber && input.sourceClaimSeq != null) {
    try {
      const resp = await historicalInquiryAdapter.getLegacyClaimPayments(
        input.sourceClaimNumber,
        input.sourceClaimSeq,
      );
      for (const c of resp.data.cheques) {
        out.push({
          source: 'LEGACY_CHEQUE',
          sourceBadge: 'Legacy Cheque',
          id: String(c.cheque_number ?? `${input.sourceClaimNumber}-${input.sourceClaimSeq}`),
          reference: c.cheque_number ?? null,
          amount: c.amount ?? null,
          currency: 'XCD',
          date: c.issue_date ?? null,
          status: c.status ?? null,
          voided: c.voided,
          bank_account: c.bank_account ?? null,
          claim_ref: `${input.sourceClaimNumber}-${input.sourceClaimSeq}`,
          raw: c.raw,
        });
      }
    } catch {
      // legacy unreachable — return only BN rows
    }
  }

  return out.sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
}

export async function getUnifiedPaymentsBySsn(ssn: string): Promise<UnifiedPaymentRow[]> {
  const out: UnifiedPaymentRow[] = [];

  const { data: bn } = await db
    .from('bn_payment_instruction')
    .select('*')
    .eq('ssn', ssn.trim())
    .order('due_date', { ascending: false });
  for (const r of bn ?? []) out.push(mapBnInstruction(r));

  try {
    const { data: legacy } = await db
      .from('cl_cheques')
      .select('cheque_number, amount, cheque_amount, issue_date, cheque_date, status, account_number, claim_number, claim_seq')
      .eq('ssn', ssn.trim())
      .order('issue_date', { ascending: false });
    for (const c of legacy ?? []) {
      out.push({
        source: 'LEGACY_CHEQUE',
        sourceBadge: 'Legacy Cheque',
        id: String(c.cheque_number ?? `${c.claim_number}-${c.claim_seq}`),
        reference: c.cheque_number ?? null,
        amount: c.amount ?? c.cheque_amount ?? null,
        currency: 'XCD',
        date: c.issue_date ?? c.cheque_date ?? null,
        status: c.status ?? null,
        bank_account: c.account_number ?? null,
        claim_ref: c.claim_number ? `${c.claim_number}-${c.claim_seq}` : null,
        raw: c,
      });
    }
  } catch {
    // legacy table not reachable
  }

  return out.sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
}

export const paymentBoundaryService = {
  createAwardFromApprovedClaim,
  createScheduleFromAward,
  createInstructionsFromDueSchedule,
  provisionPaymentIntent,
  getUnifiedPaymentsForClaim,
  getUnifiedPaymentsBySsn,
};

export default paymentBoundaryService;
