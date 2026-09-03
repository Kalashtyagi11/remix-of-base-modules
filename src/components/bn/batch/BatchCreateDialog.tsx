import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ExecuteBatchActionParams, BatchPaymentMethod } from '@/services/bn/batchOperationsService';
import { useActorUserCode } from '@/hooks/bn/useActorUserCode';
import { listChequeStock, type ChequeStock } from '@/services/bn/payment/chequeStockService';

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: (params: ExecuteBatchActionParams) => Promise<void>;
  isActing: boolean;
}

export const BatchCreateDialog: React.FC<Props> = ({ open, onClose, onAction, isActing }) => {
  // Writes must name a person, never the 'CURRENT_USER' placeholder.
  const { actor } = useActorUserCode();

  const { data: stockData } = useQuery({
    queryKey: ['bn-cheque-stock-create-dialog'],
    queryFn: () => listChequeStock(),
    enabled: open,
  });

  const activeBooks = useMemo(() => {
    const all = (stockData || []) as ChequeStock[];
    const seen = new Set<string>();
    return all.filter((s) => {
      if (s.status !== 'ACTIVE' || seen.has(s.bank_account_ref)) return false;
      seen.add(s.bank_account_ref);
      return true;
    });
  }, [stockData]);

  const isChequeMethod = (m: BatchPaymentMethod) => m === 'CHEQUE' || m === 'MIXED';

  const [batchDate, setBatchDate] = useState<Date | undefined>(new Date());
  const [officeCode, setOfficeCode] = useState('HQ');
  const [paymentMethod, setPaymentMethod] = useState<BatchPaymentMethod>('MIXED');
  const [bankAccountRef, setBankAccountRef] = useState<string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (activeBooks.length === 1 && !bankAccountRef) {
      setBankAccountRef(activeBooks[0].bank_account_ref);
    } else if (!isChequeMethod(paymentMethod)) {
      setBankAccountRef('');
    }
  }, [activeBooks, paymentMethod, bankAccountRef]);

  const handleCreate = async () => {
    if (!batchDate) return;
    await onAction({
      action: 'CREATE',
      userCode: actor(),
      batchDate: batchDate.toISOString().slice(0, 10),
      officeCode,
      paymentMethod,
      bankAccountRef: isChequeMethod(paymentMethod) ? bankAccountRef || undefined : undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
    setNotes('');
    setBankAccountRef('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Payment Batch</DialogTitle>
          <DialogDescription>
            Create a new batch to group payable instructions for controlled issuance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Batch Date</Label>
            <DatePicker date={batchDate} onDateChange={setBatchDate} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Office Code</Label>
            <Input
              value={officeCode}
              onChange={(e) => setOfficeCode(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="e.g. HQ"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as BatchPaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="DIRECT_DEPOSIT">Direct Deposit</SelectItem>
                <SelectItem value="MIXED">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isChequeMethod(paymentMethod) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cheque Bank Account (optional)</Label>
              {activeBooks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No active cheque stock. You can create the batch, but cheque numbers cannot be assigned until a book is registered.
                </p>
              ) : (
                <Select value={bankAccountRef} onValueChange={setBankAccountRef}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select active cheque book" /></SelectTrigger>
                  <SelectContent>
                    {activeBooks.map((book) => (
                      <SelectItem key={book.bank_account_ref} value={book.bank_account_ref}>
                        {book.bank_account_ref} — {book.bank_code || 'Book'} ({book.series_prefix || ''}{book.next_number.toLocaleString()} next)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Batch description or notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isActing}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!batchDate || !officeCode || isActing}>
            {isActing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
