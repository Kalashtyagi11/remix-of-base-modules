/**
 * Batch Operations Service
 *
 * Business Purpose:
 *   Groups payable instructions into controlled payment batches before issue.
 *   Acts as the final orchestration layer between approved payables and
 *   legacy payment persistence (cl_cheques / cl_cheques_holding / cl_cheques_survivor).
 *
 * Existing tables used:
 *   - bn_payment_instruction (payable records to batch)
 *   - bn_entitlement (entitlement context for each payable)
 *   - bn_claim (claim context, linked-claim refs)
 *   - bn_claim_event (audit trail)
 *   - cl_head (legacy claim header — soft join via claim_number)
 *   - cl_cheques / cl_cheques_holding (outbound payment persistence — issue process writes here)
 *
 * New tables used:
 *   - bn_payment_batch (this module's primary table)
 *   - bn_payment_exception (exception routing for failed items)
 *
 * CRITICAL CONSTRAINTS:
 *   - This module does NOT write to cn_payment*, cn_receipt, cn_refund.
 *   - Actual cl_cheques writes happen in the ISSUE step only.
 *   - cn_payment* tables are strictly for incoming collections/receipts.
 *   - Batch is an orchestration control layer — not the payment ledger.
 */
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

// ─── Types ──────────────────────────────────────────────────────────

export type BatchStatus =
  | 'OPEN'           // Created, accepting payables
  | 'VALIDATED'      // All items validated, pending approval
  | 'APPROVED'       // Approved by supervisor, ready for release
  | 'RELEASED'       // Released for issue — cl_cheques write begins
  | 'ISSUED'         // All items issued to cl_cheques*
  | 'PARTIALLY_ISSUED' // Some items issued, others failed
  | 'CANCELLED'      // Batch cancelled before issue
  | 'REOPENED';      // Reopened from VALIDATED/CANCELLED for corrections

export type BatchPaymentMethod = 'CHEQUE' | 'DIRECT_DEPOSIT' | 'MIXED';

export type BatchItemStatus =
  | 'INCLUDED'       // Payable added to batch
  | 'VALIDATED'      // Passed readiness checks
  | 'FAILED_VALIDATION' // Failed readiness
  | 'ISSUED'         // Written to cl_cheques*
  | 'ISSUE_FAILED'   // Write to cl_cheques failed
  | 'REMOVED'        // Removed from batch
  | 'EXCEPTION';     // Routed to exception handling

export type BatchAction =
  | 'CREATE'
  | 'ADD_PAYABLES'
  | 'REMOVE_PAYABLE'
  | 'VALIDATE'
  | 'APPROVE'
  | 'RELEASE'
  | 'CANCEL'
  | 'REOPEN'
  | 'ISSUE';          // Downstream issue trigger

// ─── Interfaces ─────────────────────────────────────────────────────

export interface BnPaymentBatch {
  id: string;
  batch_number: string;
  batch_date: string;
  payment_method: BatchPaymentMethod;
  status: BatchStatus;
  office_code: string;

  // Counts & totals
  total_items: number;
  total_amount: number;
  currency: string;
  validated_items: number;
  failed_items: number;
  issued_items: number;

  // Workflow
  created_by: string | null;
  created_at: string;
  validated_by: string | null;
  validated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  released_by: string | null;
  released_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;

  // Issue tracking
  issue_started_at: string | null;
  issue_completed_at: string | null;
  issue_error_count: number;

  notes: string | null;
}

export interface BatchPayableItem {
  id: string;
  batch_id: string;
  instruction_id: string;
  item_status: BatchItemStatus;
  sequence_number: number;

  // Denormalized for display
  ssn: string;
  claim_number: string | null;
  beneficiary_name: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  period_start: string | null;
  period_end: string | null;
  instruction_type: string;

  // Validation
  validation_errors: string[] | null;

  // Issue tracking
  cl_cheque_no: string | null;
  issued_at: string | null;
  issue_error: string | null;

  added_at: string;
  added_by: string | null;
}

export interface BatchFilters {
  status?: BatchStatus;
  payment_method?: BatchPaymentMethod;
  office_code?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// ─── Status Transition Matrix ───────────────────────────────────────

const BATCH_TRANSITIONS: Record<BatchStatus, BatchAction[]> = {
  OPEN:             ['ADD_PAYABLES', 'REMOVE_PAYABLE', 'VALIDATE', 'CANCEL'],
  VALIDATED:        ['APPROVE', 'REOPEN', 'CANCEL'],
  APPROVED:         ['RELEASE', 'REOPEN', 'CANCEL'],
  RELEASED:         ['ISSUE'],
  ISSUED:           [],
  PARTIALLY_ISSUED: ['ISSUE', 'CANCEL'],  // Retry remaining items
  CANCELLED:        ['REOPEN'],
  REOPENED:         ['ADD_PAYABLES', 'REMOVE_PAYABLE', 'VALIDATE', 'CANCEL'],
};

export function getAvailableBatchActions(status: BatchStatus): BatchAction[] {
  return BATCH_TRANSITIONS[status] || [];
}

// ─── Role Permissions ───────────────────────────────────────────────

const ACTION_ROLES: Record<BatchAction, string[]> = {
  CREATE:         ['CLAIMS_OFFICER', 'SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
  ADD_PAYABLES:   ['CLAIMS_OFFICER', 'SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
  REMOVE_PAYABLE: ['SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
  VALIDATE:       ['CLAIMS_OFFICER', 'SUPERVISOR', 'MANAGER', 'FINANCE_OFFICER'],
  APPROVE:        ['SUPERVISOR', 'MANAGER'],
  RELEASE:        ['MANAGER', 'FINANCE_OFFICER'],
  CANCEL:         ['SUPERVISOR', 'MANAGER'],
  REOPEN:         ['MANAGER'],
  ISSUE:          ['MANAGER', 'FINANCE_OFFICER'],
};

export function canPerformBatchAction(action: BatchAction, userRole: string): boolean {
  return ACTION_ROLES[action]?.includes(userRole) ?? false;
}

// ─── Fetch Batches ──────────────────────────────────────────────────

export async function fetchBatches(filters: BatchFilters = {}): Promise<BnPaymentBatch[]> {
  let query = db.from('bn_payment_batch').select('*').order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.payment_method) query = query.eq('payment_method', filters.payment_method);
  if (filters.office_code) query = query.eq('office_code', filters.office_code);
  if (filters.date_from) query = query.gte('batch_date', filters.date_from);
  if (filters.date_to) query = query.lte('batch_date', filters.date_to);
  if (filters.search) {
    query = query.or(`batch_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchBatchDetail(batchId: string): Promise<BnPaymentBatch> {
  const { data, error } = await db.from('bn_payment_batch').select('*').eq('id', batchId).single();
  if (error) throw error;
  return data;
}

// ─── Fetch Batch Items ──────────────────────────────────────────────

export async function fetchBatchItems(batchId: string): Promise<BatchPayableItem[]> {
  const { data, error } = await db
    .from('bn_batch_item')
    .select('*')
    .eq('batch_id', batchId)
    .order('sequence_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ─── Fetch Available Payables (READY status, not yet batched) ───────

export async function fetchAvailablePayables(
  paymentMethod?: string,
  officeCode?: string
): Promise<any[]> {
  let query = db
    .from('bn_payment_instruction')
    .select('*')
    .eq('status', 'READY')
    .is('batch_id', null)
    .order('created_at', { ascending: true });

  if (paymentMethod && paymentMethod !== 'MIXED') {
    query = query.eq('payment_method', paymentMethod);
  }
  if (officeCode) query = query.eq('office_code', officeCode);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── Batch Actions ──────────────────────────────────────────────────

export interface ExecuteBatchActionParams {
  batchId?: string;
  action: BatchAction;
  userCode: string;
  narrative?: string;
  payableIds?: string[];       // For ADD_PAYABLES
  removeItemId?: string;       // For REMOVE_PAYABLE
  paymentMethod?: BatchPaymentMethod;
  officeCode?: string;
  batchDate?: string;
  notes?: string;
}

export async function executeBatchAction(params: ExecuteBatchActionParams): Promise<any> {
  const { action, userCode, batchId, narrative } = params;

  switch (action) {
    case 'CREATE':
      return createBatch(params);
    case 'ADD_PAYABLES':
      return addPayablesToBatch(batchId!, params.payableIds || [], userCode);
    case 'REMOVE_PAYABLE':
      return removePayableFromBatch(batchId!, params.removeItemId!, userCode, narrative);
    case 'VALIDATE':
      return validateBatch(batchId!, userCode);
    case 'APPROVE':
      return approveBatch(batchId!, userCode, narrative);
    case 'RELEASE':
      return releaseBatch(batchId!, userCode, narrative);
    case 'CANCEL':
      return cancelBatch(batchId!, userCode, narrative || 'Batch cancelled');
    case 'REOPEN':
      return reopenBatch(batchId!, userCode, narrative);
    case 'ISSUE':
      return issueBatch(batchId!, userCode);
    default:
      throw new Error(`Unknown batch action: ${action}`);
  }
}

// ─── Create Batch ───────────────────────────────────────────────────

async function createBatch(params: ExecuteBatchActionParams): Promise<BnPaymentBatch> {
  const batchNumber = generateBatchNumber(params.officeCode || 'HQ');

  const newBatch = {
    batch_number: batchNumber,
    batch_date: params.batchDate || new Date().toISOString().slice(0, 10),
    payment_method: params.paymentMethod || 'MIXED',
    status: 'OPEN',
    office_code: params.officeCode || 'HQ',
    total_items: 0,
    total_amount: 0,
    currency: 'XCD',
    validated_items: 0,
    failed_items: 0,
    issued_items: 0,
    issue_error_count: 0,
    created_by: params.userCode,
    notes: params.notes || null,
  };

  const { data, error } = await db.from('bn_payment_batch').insert(newBatch).select().single();
  if (error) throw error;

  await logBatchEvent(data.id, null, 'CREATE', params.userCode, 'Batch created', { batch_number: batchNumber });

  return data;
}

function generateBatchNumber(officeCode: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `BN-${officeCode}-${date}-${time}`;
}

// ─── Add Payables to Batch ──────────────────────────────────────────

async function addPayablesToBatch(
  batchId: string,
  payableIds: string[],
  userCode: string
): Promise<void> {
  if (!payableIds.length) throw new Error('No payables selected');

  // Fetch existing item count for sequencing
  const { data: existing } = await db
    .from('bn_batch_item')
    .select('sequence_number')
    .eq('batch_id', batchId)
    .order('sequence_number', { ascending: false })
    .limit(1);

  let nextSeq = (existing?.[0]?.sequence_number || 0) + 1;

  // Fetch payable details
  const { data: payables, error: pErr } = await db
    .from('bn_payment_instruction')
    .select('*')
    .in('id', payableIds)
    .eq('status', 'READY')
    .is('batch_id', null);

  if (pErr) throw pErr;
  if (!payables?.length) throw new Error('No eligible payables found');

  // Duplicate check: ensure no payable already in another batch
  const existingInBatch = payables.filter((p: any) => p.batch_id);
  if (existingInBatch.length > 0) {
    throw new Error(`${existingInBatch.length} payable(s) already assigned to a batch`);
  }

  // Resolve claim context. bn_payment_instruction holds a claim_id, not a
  // claim_number — reading `p.claim_number` always yielded undefined, so every
  // batch item failed validation with "Missing claim number".
  const claimIds = Array.from(new Set(payables.map((p: any) => p.claim_id).filter(Boolean)));
  const claimMap = new Map<string, any>();
  if (claimIds.length) {
    const { data: claims } = await db
      .from('bn_claim')
      .select('id, claim_number, ssn')
      .in('id', claimIds);
    (claims || []).forEach((c: any) => claimMap.set(c.id, c));
  }

  // Create batch items
  const items = payables.map((p: any) => {
    const claim = p.claim_id ? claimMap.get(p.claim_id) : null;
    return {
      batch_id: batchId,
      instruction_id: p.id,
      item_status: 'INCLUDED',
      sequence_number: nextSeq++,
      ssn: p.ssn || claim?.ssn || null,
      claim_number: claim?.claim_number || null,
      beneficiary_name: p.beneficiary_name || p.payee_name || null,
      amount: p.amount,
      currency: p.currency || 'XCD',
      payment_method: p.payment_method,
      period_start: p.period_start || p.due_date || null,
      period_end: p.period_end || p.due_date || null,
      instruction_type: p.instruction_type || (p.frequency === 'ONE_OFF' ? 'LUMP_SUM' : 'PERIODIC'),
      added_by: userCode,
    };
  });

  const { error: iErr } = await db.from('bn_batch_item').insert(items);
  if (iErr) throw iErr;

  // Update instructions: link to batch
  const { error: uErr } = await db
    .from('bn_payment_instruction')
    .update({ batch_id: batchId, status: 'SCHEDULED' })
    .in('id', payableIds);
  if (uErr) throw uErr;

  // Update batch totals
  await recalculateBatchTotals(batchId);

  await logBatchEvent(batchId, null, 'ADD_PAYABLES', userCode, `Added ${payables.length} payables`, {
    count: payables.length,
    payable_ids: payableIds,
  });
}

// ─── Remove Payable from Batch ──────────────────────────────────────

async function removePayableFromBatch(
  batchId: string,
  itemId: string,
  userCode: string,
  reason?: string
): Promise<void> {
  // Get item to find instruction_id
  const { data: item, error: fErr } = await db
    .from('bn_batch_item')
    .select('*')
    .eq('id', itemId)
    .eq('batch_id', batchId)
    .single();
  if (fErr) throw fErr;
  if (!item) throw new Error('Batch item not found');

  if (item.item_status === 'ISSUED') throw new Error('Cannot remove issued item');

  // Mark item as REMOVED
  await db.from('bn_batch_item').update({ item_status: 'REMOVED' }).eq('id', itemId);

  // Unlink instruction from batch, reset to READY
  await db
    .from('bn_payment_instruction')
    .update({ batch_id: null, status: 'READY' })
    .eq('id', item.instruction_id);

  await recalculateBatchTotals(batchId);

  await logBatchEvent(batchId, item.instruction_id, 'REMOVE_PAYABLE', userCode, reason || 'Item removed from batch', {
    item_id: itemId,
    ssn: item.ssn,
    amount: item.amount,
  });
}

// ─── Validate Batch ─────────────────────────────────────────────────

export interface BatchValidationResult {
  valid: boolean;
  totalItems: number;
  validatedCount: number;
  failedCount: number;
  errors: Array<{ itemId: string; ssn: string; errors: string[] }>;
}

async function validateBatch(batchId: string, userCode: string): Promise<BatchValidationResult> {
  const { data: items } = await db
    .from('bn_batch_item')
    .select('*')
    .eq('batch_id', batchId)
    .in('item_status', ['INCLUDED', 'VALIDATED', 'FAILED_VALIDATION']);

  if (!items?.length) throw new Error('No items in batch to validate');

  const result: BatchValidationResult = {
    valid: true,
    totalItems: items.length,
    validatedCount: 0,
    failedCount: 0,
    errors: [],
  };

  for (const item of items) {
    const itemErrors: string[] = [];

    // Validation rules
    if (!item.amount || item.amount <= 0) itemErrors.push('Invalid amount');
    if (!item.ssn) itemErrors.push('Missing SSN');
    if (!item.claim_number) itemErrors.push('Missing claim number');
    if (item.payment_method === 'DIRECT_DEPOSIT') {
      const { data: instr } = await db
        .from('bn_payment_instruction')
        .select('account_number, bank_account_snapshot')
        .eq('id', item.instruction_id)
        .maybeSingle();
      if (!instr?.account_number && !instr?.bank_account_snapshot) {
        itemErrors.push('DD requires beneficiary bank details');
      }
    }

    const newStatus = itemErrors.length > 0 ? 'FAILED_VALIDATION' : 'VALIDATED';
    await db
      .from('bn_batch_item')
      .update({ item_status: newStatus, validation_errors: itemErrors.length ? itemErrors : null })
      .eq('id', item.id);

    if (itemErrors.length > 0) {
      result.failedCount++;
      result.valid = false;
      result.errors.push({ itemId: item.id, ssn: item.ssn, errors: itemErrors });
    } else {
      result.validatedCount++;
    }
  }

  // Update batch status
  const batchStatus = result.valid ? 'VALIDATED' : 'OPEN'; // Stay OPEN if failures
  await db.from('bn_payment_batch').update({
    status: batchStatus,
    validated_by: userCode,
    validated_at: new Date().toISOString(),
    validated_items: result.validatedCount,
    failed_items: result.failedCount,
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'VALIDATE', userCode, `Validated: ${result.validatedCount} passed, ${result.failedCount} failed`, {
    validation_result: result,
  });

  return result;
}

// ─── Approve Batch ──────────────────────────────────────────────────

async function approveBatch(batchId: string, userCode: string, narrative?: string): Promise<void> {
  const batch = await fetchBatchDetail(batchId);
  if (batch.status !== 'VALIDATED') throw new Error('Batch must be VALIDATED before approval');
  if (batch.created_by === userCode) throw new Error('Batch cannot be approved by creator (maker-checker)');

  await db.from('bn_payment_batch').update({
    status: 'APPROVED',
    approved_by: userCode,
    approved_at: new Date().toISOString(),
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'APPROVE', userCode, narrative || 'Batch approved for release', {});
}

// ─── Release Batch ──────────────────────────────────────────────────

async function releaseBatch(batchId: string, userCode: string, narrative?: string): Promise<void> {
  const batch = await fetchBatchDetail(batchId);
  if (batch.status !== 'APPROVED') throw new Error('Batch must be APPROVED before release');

  await db.from('bn_payment_batch').update({
    status: 'RELEASED',
    released_by: userCode,
    released_at: new Date().toISOString(),
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'RELEASE', userCode, narrative || 'Batch released for issue', {});
}

// ─── Issue Batch (writes to cl_cheques*) ────────────────────────────

async function issueBatch(batchId: string, userCode: string): Promise<{ issued: number; failed: number }> {
  const batch = await fetchBatchDetail(batchId);
  if (batch.status !== 'RELEASED' && batch.status !== 'PARTIALLY_ISSUED') {
    throw new Error('Batch must be RELEASED or PARTIALLY_ISSUED for issue');
  }

  await db.from('bn_payment_batch').update({
    issue_started_at: new Date().toISOString(),
  }).eq('id', batchId);

  // Get validated items not yet issued
  const { data: items } = await db
    .from('bn_batch_item')
    .select('*')
    .eq('batch_id', batchId)
    .in('item_status', ['VALIDATED', 'ISSUE_FAILED']);

  let issued = 0;
  let failed = 0;

  for (const item of (items || [])) {
    try {
      // Write to cl_cheques (legacy outbound payment table)
      const chequeData = {
        ssn: item.ssn,
        claim_number: item.claim_number,
        amount: item.amount,
        payment_method: item.payment_method,
        period_start: item.period_start,
        period_end: item.period_end,
        batch_number: batch.batch_number,
        issued_by: userCode,
        issued_date: new Date().toISOString(),
        status: 'ISSUED',
      };

      const { data: cheque, error: cErr } = await db
        .from('cl_cheques')
        .insert(chequeData)
        .select('cheque_no')
        .single();

      if (cErr) throw cErr;

      // Update batch item
      await db.from('bn_batch_item').update({
        item_status: 'ISSUED',
        cl_cheque_no: cheque?.cheque_no || null,
        issued_at: new Date().toISOString(),
      }).eq('id', item.id);

      // Update instruction status
      await db.from('bn_payment_instruction').update({
        status: 'ISSUED_PENDING',
        cl_cheque_no: cheque?.cheque_no || null,
      }).eq('id', item.instruction_id);

      issued++;
    } catch (err: any) {
      // Mark as failed
      await db.from('bn_batch_item').update({
        item_status: 'ISSUE_FAILED',
        issue_error: err.message,
      }).eq('id', item.id);

      // Create exception record
      await db.from('bn_payment_exception').insert({
        instruction_id: item.instruction_id,
        batch_id: batchId,
        exception_type: 'ISSUE_FAILURE',
        description: err.message,
        status: 'OPEN',
        raised_by: userCode,
      });

      failed++;
    }
  }

  // Update batch final status
  const finalStatus = failed === 0 ? 'ISSUED' : (issued > 0 ? 'PARTIALLY_ISSUED' : 'RELEASED');
  await db.from('bn_payment_batch').update({
    status: finalStatus,
    issued_items: issued,
    issue_error_count: failed,
    issue_completed_at: new Date().toISOString(),
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'ISSUE', userCode, `Issued: ${issued}, Failed: ${failed}`, {
    issued_count: issued,
    failed_count: failed,
  });

  return { issued, failed };
}

// ─── Cancel Batch ───────────────────────────────────────────────────

async function cancelBatch(batchId: string, userCode: string, reason: string): Promise<void> {
  const batch = await fetchBatchDetail(batchId);
  if (['ISSUED', 'RELEASED'].includes(batch.status)) {
    throw new Error('Cannot cancel a released or fully issued batch');
  }

  // Reset all included/validated items back to READY on their instructions
  const { data: items } = await db
    .from('bn_batch_item')
    .select('instruction_id')
    .eq('batch_id', batchId)
    .in('item_status', ['INCLUDED', 'VALIDATED', 'FAILED_VALIDATION']);

  if (items?.length) {
    const instrIds = items.map((i: any) => i.instruction_id);
    await db.from('bn_payment_instruction').update({ batch_id: null, status: 'READY' }).in('id', instrIds);
  }

  await db.from('bn_batch_item').update({ item_status: 'REMOVED' })
    .eq('batch_id', batchId)
    .in('item_status', ['INCLUDED', 'VALIDATED', 'FAILED_VALIDATION']);

  await db.from('bn_payment_batch').update({
    status: 'CANCELLED',
    cancelled_by: userCode,
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'CANCEL', userCode, reason, {});
}

// ─── Reopen Batch ───────────────────────────────────────────────────

async function reopenBatch(batchId: string, userCode: string, narrative?: string): Promise<void> {
  const batch = await fetchBatchDetail(batchId);
  if (!['VALIDATED', 'APPROVED', 'CANCELLED'].includes(batch.status)) {
    throw new Error('Only VALIDATED, APPROVED, or CANCELLED batches can be reopened');
  }

  await db.from('bn_payment_batch').update({
    status: 'REOPENED',
    validated_by: null,
    validated_at: null,
    approved_by: null,
    approved_at: null,
  }).eq('id', batchId);

  await logBatchEvent(batchId, null, 'REOPEN', userCode, narrative || 'Batch reopened for correction', {});
}

// ─── Utility: Recalculate Totals ────────────────────────────────────

async function recalculateBatchTotals(batchId: string): Promise<void> {
  const { data: items } = await db
    .from('bn_batch_item')
    .select('amount, item_status')
    .eq('batch_id', batchId)
    .neq('item_status', 'REMOVED');

  const activeItems = items || [];
  const totalItems = activeItems.length;
  const totalAmount = activeItems.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
  const validatedItems = activeItems.filter((i: any) => i.item_status === 'VALIDATED').length;
  const failedItems = activeItems.filter((i: any) => i.item_status === 'FAILED_VALIDATION').length;
  const issuedItems = activeItems.filter((i: any) => i.item_status === 'ISSUED').length;

  await db.from('bn_payment_batch').update({
    total_items: totalItems,
    total_amount: totalAmount,
    validated_items: validatedItems,
    failed_items: failedItems,
    issued_items: issuedItems,
  }).eq('id', batchId);
}

// ─── Audit Events ───────────────────────────────────────────────────

async function logBatchEvent(
  batchId: string,
  instructionId: string | null,
  action: string,
  userCode: string,
  description: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    await db.from('bn_claim_event').insert({
      entity_type: 'PAYMENT_BATCH',
      entity_id: batchId,
      event_type: `BATCH_${action}`,
      description,
      performed_by: userCode,
      metadata: { ...metadata, instruction_id: instructionId },
    });
  } catch {
    console.error('Failed to log batch event');
  }
}

// ─── Batch Summary Stats ────────────────────────────────────────────

export async function fetchBatchSummaryStats(): Promise<Record<string, number>> {
  const { data } = await db.from('bn_payment_batch').select('status');
  const stats: Record<string, number> = {
    OPEN: 0, VALIDATED: 0, APPROVED: 0, RELEASED: 0,
    ISSUED: 0, PARTIALLY_ISSUED: 0, CANCELLED: 0, REOPENED: 0, TOTAL: 0,
  };
  (data || []).forEach((b: any) => {
    stats[b.status] = (stats[b.status] || 0) + 1;
    stats.TOTAL++;
  });
  return stats;
}
