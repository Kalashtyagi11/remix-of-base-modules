/**
 * Payment Issue Service
 *
 * Business Purpose:
 *   Issues outbound benefit disbursements by persisting to the correct
 *   claims-side payment structures: cl_cheques, cl_cheques_holding,
 *   cl_cheques_survivor. This is the final step in the benefit payment
 *   pipeline, downstream of Batch Operations.
 *
 * Existing tables used (WRITE):
 *   - cl_cheques              — Standard benefit cheque/DD issue
 *   - cl_cheques_holding      — Holding payments (withheld pending conditions)
 *   - cl_cheques_survivor     — Survivor benefit payments
 *
 * Existing tables used (READ):
 *   - cl_head                 — Claim header for validation
 *   - bn_payment_batch        — Source batch (RELEASED status)
 *   - bn_batch_item           — Individual items to issue
 *   - bn_payment_instruction  — Payable instruction context
 *   - bn_entitlement          — Entitlement context
 *   - bn_claim                — Claim context
 *   - bn_claim_event          — Audit trail
 *
 * CRITICAL CONSTRAINTS:
 *   - cn_payment*, cn_receipt, cn_refund are NEVER used for outbound payments.
 *   - All outbound benefit payments persist ONLY to cl_cheques*.
 *   - Duplicate prevention via composite key (ssn + claim + period + amount).
 *   - Reissue-safe: voided cheques can be reissued with new cheque number.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensurePostIssueTasks } from '@/services/bn/postIssueService';

const db = supabase as any;

// ─── Types ──────────────────────────────────────────────────────────

export type IssueStatus =
  | 'PENDING'          // Awaiting issue
  | 'ISSUING'          // Issue in progress
  | 'ISSUED'           // Successfully written to cl_cheques*
  | 'FAILED'           // Issue failed (retryable)
  | 'VOIDED'           // Cheque voided after issue
  | 'REISSUE_PENDING'  // Pending reissue after void
  | 'STALE_DATED'      // Cheque expired / stale-dated
  | 'STOPPED';         // Payment stopped

export type IssueMethod = 'CHEQUE' | 'DIRECT_DEPOSIT';

export type IssueTargetTable = 'cl_cheques' | 'cl_cheques_holding' | 'cl_cheques_survivor';

export type IssueAction =
  | 'ISSUE'
  | 'VOID'
  | 'REISSUE'
  | 'STOP'
  | 'STALE_DATE'
  | 'RETRY';

/**
 * Routing Rules — which cl_cheques* table to use:
 *
 * cl_cheques:          Standard benefit payments (Sickness, Maternity, Injury,
 *                      Employment Injury, Pension, Lump Sum, Grant, Medical)
 *
 * cl_cheques_holding:  Payments withheld pending:
 *                      - Outstanding documentation
 *                      - Legal hold / court order
 *                      - Address verification
 *                      - Manual review flagged by supervisor
 *
 * cl_cheques_survivor: Survivor/death benefit payments where the payee is
 *                      NOT the insured person but a named survivor/dependent.
 *                      Linked via survivor_id to the survivor record.
 */

export interface IssueRecord {
  id: string;
  batch_id: string;
  batch_item_id: string;
  instruction_id: string;

  // Beneficiary
  ssn: string;
  claim_number: string | null;
  beneficiary_name: string | null;
  survivor_id: string | null;

  // Payment
  amount: number;
  currency: string;
  issue_method: IssueMethod;
  period_start: string | null;
  period_end: string | null;
  instruction_type: string;

  // Issue tracking
  target_table: IssueTargetTable;
  status: IssueStatus;
  cheque_number: string | null;
  dd_reference: string | null;
  issued_at: string | null;
  issued_by: string | null;

  // Failure
  error_message: string | null;
  retry_count: number;
  max_retries: number;

  // Void / Reissue
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  reissue_of: string | null;  // ID of voided issue record

  // Holding
  hold_reason: string | null;
  hold_released_at: string | null;
  hold_released_by: string | null;

  created_at: string;
}

export interface IssueSummary {
  total: number;
  pending: number;
  issued: number;
  failed: number;
  voided: number;
  totalAmount: number;
}

export interface IssueFilters {
  batch_id?: string;
  status?: IssueStatus;
  issue_method?: IssueMethod;
  target_table?: IssueTargetTable;
  search?: string;
}

// ─── Target Table Routing ───────────────────────────────────────────

export function resolveTargetTable(
  instructionType: string,
  hasSurvivor: boolean,
  isHolding: boolean
): IssueTargetTable {
  if (hasSurvivor) return 'cl_cheques_survivor';
  if (isHolding) return 'cl_cheques_holding';
  return 'cl_cheques';
}

// ─── Status Transitions ─────────────────────────────────────────────

const ISSUE_TRANSITIONS: Record<IssueStatus, IssueAction[]> = {
  PENDING:         ['ISSUE'],
  ISSUING:         [],  // In-flight, no actions
  ISSUED:          ['VOID', 'STOP', 'STALE_DATE'],
  FAILED:          ['RETRY', 'VOID'],
  VOIDED:          ['REISSUE'],
  REISSUE_PENDING: ['ISSUE'],
  STALE_DATED:     ['REISSUE'],
  STOPPED:         ['REISSUE'],
};

export function getAvailableIssueActions(status: IssueStatus): IssueAction[] {
  return ISSUE_TRANSITIONS[status] || [];
}

// ─── Role Permissions ───────────────────────────────────────────────

const ISSUE_ACTION_ROLES: Record<IssueAction, string[]> = {
  ISSUE:      ['MANAGER', 'FINANCE_OFFICER'],
  VOID:       ['MANAGER', 'FINANCE_OFFICER'],
  REISSUE:    ['MANAGER', 'FINANCE_OFFICER'],
  STOP:       ['MANAGER'],
  STALE_DATE: ['SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
  RETRY:      ['SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
};

export function canPerformIssueAction(action: IssueAction, userRole: string): boolean {
  return ISSUE_ACTION_ROLES[action]?.includes(userRole) ?? false;
}

// ─── Fetch Issue Records ────────────────────────────────────────────

export async function fetchIssueRecords(filters: IssueFilters = {}): Promise<IssueRecord[]> {
  let query = db.from('bn_issue_record').select('*').order('created_at', { ascending: false });

  if (filters.batch_id) query = query.eq('batch_id', filters.batch_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.issue_method) query = query.eq('issue_method', filters.issue_method);
  if (filters.target_table) query = query.eq('target_table', filters.target_table);
  if (filters.search) {
    query = query.or(`ssn.ilike.%${filters.search}%,claim_number.ilike.%${filters.search}%,cheque_number.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchIssueRecordDetail(id: string): Promise<IssueRecord> {
  const { data, error } = await db.from('bn_issue_record').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchIssueSummary(batchId?: string): Promise<IssueSummary> {
  let query = db.from('bn_issue_record').select('status, amount');
  if (batchId) query = query.eq('batch_id', batchId);

  const { data } = await query;
  const records = data || [];

  return {
    total: records.length,
    pending: records.filter((r: any) => r.status === 'PENDING' || r.status === 'REISSUE_PENDING').length,
    issued: records.filter((r: any) => r.status === 'ISSUED').length,
    failed: records.filter((r: any) => r.status === 'FAILED').length,
    voided: records.filter((r: any) => r.status === 'VOIDED').length,
    totalAmount: records
      .filter((r: any) => r.status === 'ISSUED')
      .reduce((sum: number, r: any) => sum + (r.amount || 0), 0),
  };
}

// ─── Duplicate Prevention ───────────────────────────────────────────

function buildDuplicateKey(ssn: string, claimNumber: string | null, periodStart: string | null, periodEnd: string | null, amount: number): string {
  return `${ssn}|${claimNumber || ''}|${periodStart || ''}|${periodEnd || ''}|${amount}`;
}

async function checkDuplicate(record: Partial<IssueRecord>): Promise<boolean> {
  const { data } = await db
    .from('bn_issue_record')
    .select('id')
    .eq('ssn', record.ssn)
    .eq('claim_number', record.claim_number)
    .eq('period_start', record.period_start)
    .eq('period_end', record.period_end)
    .eq('amount', record.amount)
    .in('status', ['ISSUED', 'PENDING', 'ISSUING'])
    .limit(1);

  return (data?.length || 0) > 0;
}

async function resolveSurvivorId(claimId: string): Promise<string | null> {
  const { data } = await db
    .from('bn_claim_participant')
    .select('id')
    .eq('claim_id', claimId)
    .in('participant_role', ['SURVIVOR', 'DEPENDENT', 'BENEFICIARY'])
    .limit(1);
  return data?.[0]?.id ?? null;
}

// ─── Prepare Issue Records from Released Batch ──────────────────────

export async function prepareIssueFromBatch(batchId: string, userCode: string): Promise<number> {
  // Fetch validated batch items
  const { data: items, error } = await db
    .from('bn_batch_item')
    .select('*')
    .eq('batch_id', batchId)
    .eq('item_status', 'VALIDATED');

  if (error) throw error;
  if (!items?.length) throw new Error('No validated items in batch');

  const issueRecords: any[] = [];

  for (const item of items) {
    // Fetch instruction for additional context
    const { data: instr } = await db
      .from('bn_payment_instruction')
      .select('*')
      .eq('id', item.instruction_id)
      .single();

    // bn_payment_instruction has no survivor_id column; the survivor (if any)
    // is resolved from the claim's participant record.
    const survivorId = instr?.claim_id ? await resolveSurvivorId(instr.claim_id) : null;
    const hasSurvivor = !!survivorId;
    const isHolding = !!(instr?.hold_reason);
    const targetTable = resolveTargetTable(item.instruction_type, hasSurvivor, isHolding);


    // Duplicate check
    const isDup = await checkDuplicate({
      ssn: item.ssn,
      claim_number: item.claim_number,
      period_start: item.period_start,
      period_end: item.period_end,
      amount: item.amount,
    });

    if (isDup) {
      // Mark item as exception instead of creating issue record
      await db.from('bn_batch_item').update({
        item_status: 'EXCEPTION',
        validation_errors: ['Duplicate payment detected'],
      }).eq('id', item.id);

      await db.from('bn_payment_exception').insert({
        instruction_id: item.instruction_id,
        batch_id: batchId,
        exception_type: 'DUPLICATE_PAYMENT',
        description: `Duplicate: SSN ${item.ssn}, Claim ${item.claim_number}, Amount ${item.amount}`,
        status: 'OPEN',
        raised_by: userCode,
      });

      continue;
    }

    issueRecords.push({
      batch_id: batchId,
      batch_item_id: item.id,
      instruction_id: item.instruction_id,
      ssn: item.ssn,
      claim_number: item.claim_number,
      beneficiary_name: item.beneficiary_name,
      survivor_id: survivorId,
      amount: item.amount,
      currency: item.currency || 'XCD',
      issue_method: item.payment_method === 'DIRECT_DEPOSIT' ? 'DIRECT_DEPOSIT' : 'CHEQUE',
      period_start: item.period_start,
      period_end: item.period_end,
      instruction_type: item.instruction_type,
      target_table: targetTable,
      status: 'PENDING',
      retry_count: 0,
      max_retries: 3,
      hold_reason: isHolding ? instr?.hold_reason : null,
    });
  }

  if (issueRecords.length > 0) {
    const { error: iErr } = await db.from('bn_issue_record').insert(issueRecords);
    if (iErr) throw iErr;
  }

  await logIssueEvent(batchId, null, 'PREPARE', userCode,
    `Prepared ${issueRecords.length} issue records from batch`, {
      prepared: issueRecords.length,
      duplicates_blocked: items.length - issueRecords.length,
    });

  return issueRecords.length;
}

// ─── Execute Issue ──────────────────────────────────────────────────

export interface IssueResult {
  issued: number;
  failed: number;
  details: Array<{ id: string; ssn: string; status: string; error?: string }>;
}

export async function executeIssue(issueIds: string[], userCode: string): Promise<IssueResult> {
  const result: IssueResult = { issued: 0, failed: 0, details: [] };

  for (const id of issueIds) {
    const record = await fetchIssueRecordDetail(id);

    if (!['PENDING', 'REISSUE_PENDING'].includes(record.status)) {
      result.details.push({ id, ssn: record.ssn, status: 'SKIPPED', error: 'Not in issuable status' });
      continue;
    }

    // Mark as ISSUING
    await db.from('bn_issue_record').update({ status: 'ISSUING' }).eq('id', id);

    try {
      const writeResult = await writeToLegacyTable(record, userCode);

      // Update issue record
      await db.from('bn_issue_record').update({
        status: 'ISSUED',
        cheque_number: writeResult.cheque_number || null,
        dd_reference: writeResult.dd_reference || null,
        issued_at: new Date().toISOString(),
        issued_by: userCode,
      }).eq('id', id);

      // Update batch item
      await db.from('bn_batch_item').update({
        item_status: 'ISSUED',
        cl_cheque_no: writeResult.cheque_number || writeResult.dd_reference || null,
        issued_at: new Date().toISOString(),
      }).eq('id', record.batch_item_id);

      // Update instruction. `payment_reference` is the real column on
      // bn_payment_instruction — the previous `cl_cheque_no` write silently
      // failed, leaving issued money with no trace on the claim.
      const { error: linkErr } = await db.from('bn_payment_instruction').update({
        status: 'ISSUED_PENDING',
        payment_reference: writeResult.cheque_number || writeResult.dd_reference || null,
        paid_date: new Date().toISOString().slice(0, 10),
      }).eq('id', record.instruction_id);
      if (linkErr) throw new Error(`Cheque written but payable back-link failed: ${linkErr.message}`);


      // Post-issue checklist must exist for every issued payment.
      await ensurePostIssueTasks(record.batch_id ?? null, userCode, { issueRecordId: id });

      result.issued++;
      result.details.push({ id, ssn: record.ssn, status: 'ISSUED' });

    } catch (err: any) {
      const retryCount = record.retry_count + 1;
      const newStatus = retryCount >= record.max_retries ? 'FAILED' : 'PENDING';

      await db.from('bn_issue_record').update({
        status: newStatus,
        error_message: err.message,
        retry_count: retryCount,
      }).eq('id', id);

      if (newStatus === 'FAILED') {
        await db.from('bn_payment_exception').insert({
          instruction_id: record.instruction_id,
          batch_id: record.batch_id,
          exception_type: 'ISSUE_FAILURE',
          description: `Issue failed after ${retryCount} attempts: ${err.message}`,
          status: 'OPEN',
          raised_by: userCode,
        });
      }

      result.failed++;
      result.details.push({ id, ssn: record.ssn, status: 'FAILED', error: err.message });
    }
  }

  // Log aggregate event
  if (issueIds.length > 0) {
    const batchId = (await fetchIssueRecordDetail(issueIds[0])).batch_id;
    await logIssueEvent(batchId, null, 'ISSUE', userCode,
      `Issue run: ${result.issued} issued, ${result.failed} failed`, {
        issued: result.issued,
        failed: result.failed,
      });
  }

  return result;
}

// ─── Write to Legacy cl_cheques* Tables ─────────────────────────────

interface LegacyWriteResult {
  cheque_number: string | null;
  dd_reference: string | null;
}

/**
 * The legacy claims-side cheque tables use the PowerBuilder column vocabulary
 * (claim_number / claim_seq / cheque_number / cheque_item / payment_amount /
 * date_of_issue / date_period_*), NOT the modern bn_* names. Any write using
 * modern names is rejected by the database, which is why no benefit payment had
 * ever reached cl_cheques.
 */
async function nextChequeItem(claimNumber: string, claimSeq: number): Promise<number> {
  const { data } = await db
    .from('cl_cheques')
    .select('cheque_item')
    .eq('claim_number', claimNumber)
    .eq('claim_seq', claimSeq)
    .order('cheque_item', { ascending: false })
    .limit(1);
  return Number(data?.[0]?.cheque_item || 0) + 1;
}

/**
 * Legacy cl_cheques.claim_number is varchar(11); modern BN claim numbers are
 * longer. Each modern claim therefore gets a stable 11-character legacy
 * reference, persisted on bn_claim.legacy_claim_ref so the same claim always
 * maps to the same legacy key.
 */
async function resolveLegacyClaimNumber(record: IssueRecord): Promise<string> {
  const modern = String(record.claim_number);
  if (modern.length <= 11) return modern;

  const { data: instr } = await db
    .from('bn_payment_instruction')
    .select('claim_id')
    .eq('id', record.instruction_id)
    .maybeSingle();
  const claimId = instr?.claim_id;

  if (claimId) {
    const { data: claim } = await db
      .from('bn_claim')
      .select('legacy_claim_ref')
      .eq('id', claimId)
      .maybeSingle();
    const existing = (claim?.legacy_claim_ref || '').trim();
    if (existing && existing.length <= 11) return existing;
  }

  const digits = modern.replace(/\D/g, '');
  let base = Number(digits.slice(-9) || '0');
  let candidate = '';
  for (let attempt = 0; attempt < 25; attempt++) {
    candidate = `BN${String((base + attempt) % 1_000_000_000).padStart(9, '0')}`;
    const { data: clash } = await db
      .from('cl_cheques')
      .select('claim_number')
      .eq('claim_number', candidate)
      .limit(1);
    const { data: refClash } = await db
      .from('bn_claim')
      .select('id')
      .eq('legacy_claim_ref', candidate)
      .limit(1);
    if (!clash?.length && !refClash?.length) break;
  }

  if (claimId) {
    await db.from('bn_claim').update({ legacy_claim_ref: candidate }).eq('id', claimId);
  }
  return candidate;
}

/** Legacy cheque_number is varchar(11); benefit cheques use a 9xxxxxxx range. */
async function nextLegacyChequeNumber(): Promise<string> {
  // Legacy cheque numbers are stored as text and include 9-digit values, so the
  // range is matched on an exact 8-character `9` pattern rather than a string
  // comparison (which would pick up 900000000 and reset the sequence).
  const { data } = await db
    .from('cl_cheques')
    .select('cheque_number')
    .like('cheque_number', '9000____')
    .order('cheque_number', { ascending: false })
    .limit(500);
  const last = (data || [])
    .map((r: any) => String(r.cheque_number || ''))
    .filter((n: string) => /^9000\d{4}$/.test(n))
    .map(Number)
    .reduce((a: number, b: number) => Math.max(a, b), 0);
  const next = last >= 90000001 && last < 90009999 ? last + 1 : 90000001;
  return String(next);
}

async function writeToLegacyTable(
  record: IssueRecord,
  userCode: string,
  preferredChequeNumber?: string | null,
): Promise<LegacyWriteResult> {
  if (!record.claim_number) throw new Error('Issue record has no claim number — cannot write to cl_cheques');

  const now = new Date().toISOString();
  const claimSeq = 1;

  // Direct-deposit payments are not cheques: they are recorded on the issue
  // record only and never fabricate a cheque number in the legacy register.
  if (record.issue_method === 'DIRECT_DEPOSIT') {
    return { cheque_number: null, dd_reference: await generateDDReference() };
  }

  const claimNumber = await resolveLegacyClaimNumber(record);
  // A cheque already assigned from physical stock is authoritative; only fall
  // back to the generated sequence when no stock number exists.
  const assigned = (preferredChequeNumber || '').trim();
  const chequeNumber = assigned && assigned.length <= 11
    ? assigned
    : await nextLegacyChequeNumber();
  const chequeItem = await nextChequeItem(claimNumber, claimSeq);

  const { data: batch } = await db
    .from('bn_payment_batch')
    .select('batch_number')
    .eq('id', record.batch_id)
    .maybeSingle();

  const legacyRow: any = {
    claim_number: claimNumber,
    claim_seq: claimSeq,
    cheque_number: chequeNumber,
    cheque_item: chequeItem,
    payment_amount: record.amount,
    cheque_type: 'G',
    cheque_status: 'O',            // O = outstanding / issued, not yet cashed
    date_of_issue: now,
    cheque_date: now,
    date_period_start: record.period_start || null,
    date_period_end: record.period_end || null,
    batch_number: (batch?.batch_number || '').slice(0, 25) || null,
    entered_by: (userCode || 'BN').slice(0, 5),
    date_entered: now,
    remarks: `${record.instruction_type || 'BENEFIT'} ${record.ssn}`.slice(0, 25),
  };

  const table = record.target_table;

  if (table === 'cl_cheques_survivor') {
    const { error: sErr } = await db.from('cl_cheques_survivor').insert({
      survivor_number: 1,
      claim_number: claimNumber,
      claim_seq: claimSeq,
      cheque_number: chequeNumber,
      cheque_item: chequeItem,
      payment_amount: record.amount,
    });
    if (sErr) throw sErr;
  } else if (table === 'cl_cheques_holding') {
    const { error: hErr } = await db.from('cl_cheques_holding').insert({
      ...legacyRow,
      cheque_id: Date.now(),
      cheque_status: 'O',
      remarks: `HOLD ${record.hold_reason || 'withheld'}`.slice(0, 25),
    });
    if (hErr) throw hErr;
  } else {
    const { error } = await db.from('cl_cheques').insert(legacyRow);
    if (error) throw error;
  }

  return { cheque_number: chequeNumber, dd_reference: null };
}

/**
 * Shared legacy writer for the Batch Operations "Issue" action.
 *
 * Batch Operations previously wrote its own row into cl_cheques using modern
 * bn_* column names, which the database rejected. It now reuses this single
 * canonical writer so both issue paths persist identical legacy structures.
 */
export async function writeBatchItemToLegacyPayment(params: {
  batchId: string;
  instructionId: string;
  claimNumber: string;
  ssn: string;
  amount: number;
  paymentMethod: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  instructionType?: string | null;
  chequeNumber?: string | null;
  userCode: string;
}): Promise<LegacyWriteResult> {
  const record = {
    batch_id: params.batchId,
    instruction_id: params.instructionId,
    claim_number: params.claimNumber,
    ssn: params.ssn,
    amount: params.amount,
    issue_method: params.paymentMethod === 'DIRECT_DEPOSIT' || params.paymentMethod === 'EFT'
      ? 'DIRECT_DEPOSIT'
      : 'CHEQUE',
    period_start: params.periodStart || null,
    period_end: params.periodEnd || null,
    instruction_type: params.instructionType || null,
    target_table: 'cl_cheques',
    hold_reason: null,
  } as unknown as IssueRecord;

  return writeToLegacyTable(record, params.userCode, params.chequeNumber ?? null);
}



// ─── Void / Reissue / Stop ──────────────────────────────────────────

export interface ExecuteIssueActionParams {
  issueId: string;
  action: IssueAction;
  userCode: string;
  reason?: string;
}

export async function executeIssueAction(params: ExecuteIssueActionParams): Promise<void> {
  const { issueId, action, userCode, reason } = params;
  const record = await fetchIssueRecordDetail(issueId);
  const available = getAvailableIssueActions(record.status);

  if (!available.includes(action)) {
    throw new Error(`Action ${action} not allowed in status ${record.status}`);
  }

  switch (action) {
    case 'VOID':
      await voidIssue(record, userCode, reason || 'Voided');
      break;
    case 'REISSUE':
      await prepareReissue(record, userCode, reason);
      break;
    case 'STOP':
      await stopIssue(record, userCode, reason || 'Payment stopped');
      break;
    case 'STALE_DATE':
      await staleDateIssue(record, userCode);
      break;
    case 'RETRY':
      await retryIssue(record, userCode);
      break;
    case 'ISSUE':
      await executeIssue([issueId], userCode);
      break;
  }

  await logIssueEvent(record.batch_id, issueId, action, userCode,
    reason || `${action} executed`, { ssn: record.ssn, cheque: record.cheque_number });
}

async function voidIssue(record: IssueRecord, userCode: string, reason: string): Promise<void> {
  // Update legacy table
  if (record.cheque_number) {
    await db.from(record.target_table).update({
      cheque_status: 'X',
      modified_by: userCode,
      date_modified: new Date().toISOString(),
      date_cancel: new Date().toISOString(),
      date_status_changed: new Date().toISOString(),
      remarks: `VOID: ${reason}`,
    }).eq('cheque_number', record.cheque_number);
  }

  // Update issue record
  await db.from('bn_issue_record').update({
    status: 'VOIDED',
    voided_at: new Date().toISOString(),
    voided_by: userCode,
    void_reason: reason,
  }).eq('id', record.id);
}

async function prepareReissue(record: IssueRecord, userCode: string, reason?: string): Promise<void> {
  // Create new issue record linked to voided one
  const newRecord = {
    batch_id: record.batch_id,
    batch_item_id: record.batch_item_id,
    instruction_id: record.instruction_id,
    ssn: record.ssn,
    claim_number: record.claim_number,
    beneficiary_name: record.beneficiary_name,
    survivor_id: record.survivor_id,
    amount: record.amount,
    currency: record.currency,
    issue_method: record.issue_method,
    period_start: record.period_start,
    period_end: record.period_end,
    instruction_type: record.instruction_type,
    target_table: record.target_table,
    status: 'REISSUE_PENDING',
    retry_count: 0,
    max_retries: 3,
    reissue_of: record.id,
    hold_reason: record.hold_reason,
  };

  await db.from('bn_issue_record').insert(newRecord);

  // Update instruction back to pending
  await db.from('bn_payment_instruction').update({
    status: 'REISSUE_PENDING',
  }).eq('id', record.instruction_id);
}

async function stopIssue(record: IssueRecord, userCode: string, reason: string): Promise<void> {
  if (record.cheque_number) {
    await db.from(record.target_table).update({
      cheque_status: 'X',
      modified_by: userCode,
      date_modified: new Date().toISOString(),
      date_status_changed: new Date().toISOString(),
      remarks: `STOPPED: ${reason}`,
    }).eq('cheque_number', record.cheque_number);
  }

  await db.from('bn_issue_record').update({
    status: 'STOPPED',
    void_reason: reason,
    voided_by: userCode,
    voided_at: new Date().toISOString(),
  }).eq('id', record.id);
}

async function staleDateIssue(record: IssueRecord, userCode: string): Promise<void> {
  if (record.cheque_number) {
    await db.from(record.target_table).update({
      cheque_status: 'S',
      date_stale: new Date().toISOString(),
      modified_by: userCode,
      date_modified: new Date().toISOString(),
    }).eq('cheque_number', record.cheque_number);
  }

  await db.from('bn_issue_record').update({ status: 'STALE_DATED' }).eq('id', record.id);
}

async function retryIssue(record: IssueRecord, userCode: string): Promise<void> {
  await db.from('bn_issue_record').update({
    status: 'PENDING',
    error_message: null,
  }).eq('id', record.id);
}

// ─── Cheque / DD Number Generation ──────────────────────────────────

async function generateChequeNumber(): Promise<string> {
  // Get next sequence from a counter or generate time-based
  const now = new Date();
  const seq = now.getTime().toString().slice(-8);
  return `CHQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${seq}`;
}

async function generateDDReference(): Promise<string> {
  const now = new Date();
  const seq = now.getTime().toString().slice(-8);
  return `DD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${seq}`;
}

// ─── Release Holding Payment ────────────────────────────────────────

export async function releaseHoldingPayment(issueId: string, userCode: string, reason?: string): Promise<void> {
  const record = await fetchIssueRecordDetail(issueId);
  if (record.target_table !== 'cl_cheques_holding') {
    throw new Error('Only holding payments can be released');
  }

  // Move from cl_cheques_holding to cl_cheques
  const { data: holdingRow, error: fErr } = await db
    .from('cl_cheques_holding')
    .select('*')
    .eq('cheque_number', record.cheque_number)
    .single();

  if (fErr) throw fErr;

  // Insert into cl_cheques
  const { cheque_id: _cid, cheque_number: _cn, modifier: _m, modified_date: _md, ...chequeData } = holdingRow;
  chequeData.cheque_number = await generateChequeNumber();
  chequeData.cheque_status = 'O';
  chequeData.modified_by = userCode;
  chequeData.date_modified = new Date().toISOString();
  chequeData.remarks = `${chequeData.remarks || ''} | HOLD RELEASED`.trim();

  const { error: iErr } = await db.from('cl_cheques').insert(chequeData);
  if (iErr) throw iErr;

  // Mark holding record as released
  await db.from('cl_cheques_holding').update({
    cheque_status: 'C',
    modified_by: userCode,
    date_modified: new Date().toISOString(),
    remarks: 'RELEASED FROM HOLDING',
  }).eq('cheque_number', record.cheque_number);

  // Update issue record
  await db.from('bn_issue_record').update({
    hold_released_at: new Date().toISOString(),
    hold_released_by: userCode,
    cheque_number: chequeData.cheque_number,
  }).eq('id', issueId);

  await logIssueEvent(record.batch_id, issueId, 'RELEASE_HOLD', userCode,
    reason || 'Holding payment released', { old_cheque: record.cheque_number, new_cheque: chequeData.cheque_number });
}

// ─── Audit ──────────────────────────────────────────────────────────

async function logIssueEvent(
  batchId: string,
  issueId: string | null,
  action: string,
  userCode: string,
  description: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    await db.from('bn_claim_event').insert({
      entity_type: 'PAYMENT_ISSUE',
      entity_id: issueId || batchId,
      event_type: `ISSUE_${action}`,
      description,
      performed_by: userCode,
      metadata: { ...metadata, batch_id: batchId, issue_id: issueId },
    });
  } catch {
    console.error('Failed to log issue event');
  }
}
