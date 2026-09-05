/**
 * BN Payment Adapter — Bridges to existing cashier/payment module
 * 
 * Currently writes to bn_payment_instruction for the payment module to consume.
 * When the Finance module API is ready, this adapter calls it directly.
 */
import { supabase } from '@/integrations/supabase/client';
import type { IBnPaymentAdapter, PaymentInstruction, PaymentResult, PaymentStatus } from './contracts';

const db = supabase as any;

export const bnPaymentAdapter: IBnPaymentAdapter = {
  async submitPaymentInstruction(instruction): Promise<PaymentResult> {
    const { data, error } = await db
      .from('bn_payment_instruction')
      .insert({
        award_id: instruction.awardId,
        claim_id: instruction.claimId,
        ssn: instruction.ssn,
        amount: instruction.amount,
        currency: instruction.currency,
        payment_method: instruction.paymentMethod,
        bank_code: instruction.bankCode,
        account_number: instruction.accountNumber,
        due_date: instruction.dueDate,
        frequency: instruction.frequency,
        description: instruction.description,
        office_code: (instruction as any).officeCode || 'HQ',
        status: 'queued',
      })
      .select('id')
      .single();

    if (error) throw error;
    return {
      instructionId: data.id,
      status: 'queued',
    };
  },

  async getPaymentStatus(instructionId): Promise<PaymentStatus> {
    const { data, error } = await db
      .from('bn_payment_instruction')
      .select('id, status, paid_date, payment_reference')
      .eq('id', instructionId)
      .single();

    if (error) throw error;
    return {
      instructionId: data.id,
      status: data.status,
      paidDate: data.paid_date,
      reference: data.payment_reference,
    };
  },

  async cancelPayment(instructionId, reason): Promise<void> {
    const { error } = await db
      .from('bn_payment_instruction')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', instructionId)
      .eq('status', 'queued'); // can only cancel queued payments
    if (error) throw error;
  },

  async getPaymentHistory(ssn): Promise<PaymentStatus[]> {
    const { data, error } = await db
      .from('bn_payment_instruction')
      .select('id, status, paid_date, payment_reference')
      .eq('ssn', ssn.trim())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      instructionId: d.id,
      status: d.status,
      paidDate: d.paid_date,
      reference: d.payment_reference,
    }));
  },
};
