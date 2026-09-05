/**
 * Cheque Stock Service
 * Registers cheque-book ranges per bank account and allocates next numbers.
 */
import { supabase } from '@/integrations/supabase/client';
const db = supabase as any;

export interface ChequeStock {
  id: string;
  bank_account_ref: string;
  bank_code: string | null;
  series_prefix: string | null;
  range_start: number;
  range_end: number;
  next_number: number;
  used_count: number;
  cancelled_count: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'CLOSED';
  notes: string | null;
  registered_by: string | null;
  registered_at: string;
}

export async function listChequeStock(bankAccountRef?: string): Promise<ChequeStock[]> {
  let q = db.from('bn_cheque_stock').select('*').order('registered_at', { ascending: false });
  if (bankAccountRef) q = q.eq('bank_account_ref', bankAccountRef);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function registerChequeStock(input: {
  bank_account_ref: string;
  bank_code?: string;
  series_prefix?: string;
  range_start: number;
  range_end: number;
  notes?: string;
  registered_by: string;
}): Promise<ChequeStock> {
  if (input.range_end < input.range_start) throw new Error('Range end must be ≥ range start');
  const row = {
    bank_account_ref: input.bank_account_ref,
    bank_code: input.bank_code || null,
    series_prefix: input.series_prefix || null,
    range_start: input.range_start,
    range_end: input.range_end,
    next_number: input.range_start,
    used_count: 0,
    cancelled_count: 0,
    status: 'ACTIVE' as const,
    notes: input.notes || null,
    registered_by: input.registered_by,
  };
  const { data, error } = await db.from('bn_cheque_stock').insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * Allocates `count` cheque numbers from the first ACTIVE stock for bank_account_ref.
 * Returns assigned numbers (formatted with series_prefix if any). Updates next_number/used_count.
 */
export async function allocateChequeNumbers(
  bankAccountRef: string,
  count: number,
  startingNumber?: number,
): Promise<{ stock: ChequeStock; numbers: string[] }> {
  if (count <= 0) throw new Error('Count must be > 0');
  const { data: stocks, error } = await db
    .from('bn_cheque_stock')
    .select('*')
    .eq('bank_account_ref', bankAccountRef)
    .eq('status', 'ACTIVE')
    .order('registered_at', { ascending: true });
  if (error) throw error;
  if (!stocks || stocks.length === 0) {
    throw new Error(`No active cheque stock found for bank account "${bankAccountRef}". Register a cheque book first.`);
  }

  const ranges = stocks.map((s: ChequeStock) =>
    `${s.series_prefix || ''}${s.range_start}–${s.series_prefix || ''}${s.range_end}`
  ).join(', ');

  const capacity = (s: ChequeStock) => Math.max(0, s.range_end - s.next_number + 1);

  if (startingNumber !== undefined && !Number.isFinite(startingNumber)) {
    throw new Error('Starting number must be a numeric value');
  }

  const matchingStock = startingNumber === undefined
    ? stocks.find((s: ChequeStock) => capacity(s) >= count)
    : stocks.find((s: ChequeStock) => {
        return startingNumber >= s.range_start && startingNumber + count - 1 <= s.range_end;
      });

  if (startingNumber !== undefined && !matchingStock) {
    throw new Error(
      `Starting number ${startingNumber} does not fit any active range for "${bankAccountRef}" (${ranges}).`
    );
  }

  if (!matchingStock) {
    const remaining = stocks.reduce((sum: number, s: ChequeStock) => sum + capacity(s), 0);
    throw new Error(
      `Active stock for "${bankAccountRef}" cannot satisfy ${count} cheques (${remaining} remaining; ranges: ${ranges}).`
    );
  }

  const start = startingNumber ?? matchingStock.next_number;
  if (start < matchingStock.next_number) {
    throw new Error(
      `Starting number ${start} is below the next available number (${matchingStock.next_number}) for "${bankAccountRef}".`
    );
  }
  const numbers: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = start + i;
    numbers.push(matchingStock.series_prefix ? `${matchingStock.series_prefix}${n}` : String(n));
  }
  const newNext = start + count;
  const newStatus = newNext > matchingStock.range_end ? 'EXHAUSTED' : matchingStock.status;
  const { data: updated, error: uErr } = await db
    .from('bn_cheque_stock')
    .update({ next_number: newNext, used_count: matchingStock.used_count + count, status: newStatus })
    .eq('id', matchingStock.id)
    .select()
    .single();
  if (uErr) throw uErr;
  return { stock: updated, numbers };
}

export async function incrementCancelledCount(stockId: string, delta = 1): Promise<void> {
  const { data: cur } = await db.from('bn_cheque_stock').select('cancelled_count').eq('id', stockId).single();
  await db
    .from('bn_cheque_stock')
    .update({ cancelled_count: (cur?.cancelled_count || 0) + delta })
    .eq('id', stockId);
}
