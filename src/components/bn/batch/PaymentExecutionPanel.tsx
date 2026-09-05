/**
 * PaymentExecutionPanel
 * Combined EFT-file and Cheque-print controls for a payment batch.
 * Mounted inside BatchDetailDrawer.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateEftFile, listEftFilesForBatch, markEftSubmitted, downloadEftFile, uploadEftResponse,
} from '@/services/bn/payment/eftFileService';
import {
  assignChequeNumbersForBatch, listChequesForBatch, markPrinted, reprintCheque,
  cancelCheque, correctChequeNumber, markDispatched,
} from '@/services/bn/payment/chequePrintService';
import { listChequeStock, type ChequeStock } from '@/services/bn/payment/chequeStockService';
import { recordReconciliation } from '@/services/bn/payment/paymentReconciliationService';
import { ChequePrintView } from '@/components/bn/payment/ChequePrintView';
import { toast } from 'sonner';
import { Download, Send, FileText, Printer, RotateCw, XCircle, Pencil, Truck } from 'lucide-react';
import { formatNumber } from '@/lib/culture/culture';
import { BnBusyButton } from '@/components/bn/shared';

interface Props {
  batchId: string;
  batchType: 'EFT' | 'CHEQUE' | 'MIXED' | 'DIRECT_DEPOSIT';
  countryCode?: string;
  bankAccountRef?: string;
  userCode: string;
  canExecute: boolean;
}

export const PaymentExecutionPanel: React.FC<Props> = ({
  batchId, batchType, countryCode = 'KN', bankAccountRef = 'DEFAULT', userCode, canExecute,
}) => {
  const qc = useQueryClient();
  const isEft = batchType === 'EFT' || batchType === 'DIRECT_DEPOSIT' || batchType === 'MIXED';
  const isCheque = batchType === 'CHEQUE' || batchType === 'MIXED';

  // EFT state
  const eftFilesQ = useQuery({
    queryKey: ['bn-eft-files', batchId],
    queryFn: () => listEftFilesForBatch(batchId),
    enabled: !!batchId && isEft,
  });
  const [busy, setBusy] = useState(false);
  const [responsePayload, setResponsePayload] = useState('');

  // Cheque state
  const chequesQ = useQuery({
    queryKey: ['bn-cheques', batchId],
    queryFn: () => listChequesForBatch(batchId),
    enabled: !!batchId && isCheque,
  });
  const stockQ = useQuery({
    queryKey: ['bn-cheque-stock'],
    queryFn: () => listChequeStock(),
    enabled: isCheque,
  });

  const activeBooks = useMemo(() => {
    const all = (stockQ.data || []) as ChequeStock[];
    const seen = new Set<string>();
    return all.filter((s) => {
      if (s.status !== 'ACTIVE' || seen.has(s.bank_account_ref)) return false;
      seen.add(s.bank_account_ref);
      return true;
    });
  }, [stockQ.data]);

  const defaultBook = activeBooks.length === 1
    ? activeBooks[0].bank_account_ref
    : (bankAccountRef && activeBooks.some((b) => b.bank_account_ref === bankAccountRef) ? bankAccountRef : '');
  const [selectedBook, setSelectedBook] = useState<string>(defaultBook);
  const selectedStock = useMemo(() => activeBooks.find((b) => b.bank_account_ref === selectedBook), [activeBooks, selectedBook]);

  useEffect(() => {
    if (!selectedBook && defaultBook) setSelectedBook(defaultBook);
  }, [defaultBook, selectedBook]);

  const [chequeDate, setChequeDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [startingNumber, setStartingNumber] = useState<string>('');
  const [startingNumberError, setStartingNumberError] = useState<string | null>(null);
  const [reprintFor, setReprintFor] = useState<string | null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [correctFor, setCorrectFor] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState('');
  const [dispatchRef, setDispatchRef] = useState('');

  const run = async (fn: () => Promise<any>, success: string) => {
    setBusy(true);
    try { await fn(); toast.success(success); }
    catch (e: any) { toast.error(e?.message || 'Action failed'); }
    finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['bn-eft-files', batchId] });
      qc.invalidateQueries({ queryKey: ['bn-cheques', batchId] });
      qc.invalidateQueries({ queryKey: ['bn-cheque-stock'] });
    }
  };

  return (
    <div className="space-y-6">
      {isEft && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> EFT Bank File
          </h3>
          <div className="flex flex-wrap gap-2">
            <BnBusyButton loading={busy}
              size="sm"
              disabled={!canExecute || busy}
              onClick={() => run(
                () => generateEftFile({ batchId, countryCode, userCode }),
                'EFT file generated',
              )}
            >
              Generate EFT File
            </BnBusyButton>
          </div>
          {(eftFilesQ.data || []).length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs">Items</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(eftFilesQ.data || []).map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs">
                        <div className="font-mono">{f.file_name}</div>
                        <div className="text-[10px] text-muted-foreground">hash {f.file_hash?.slice(0, 12)}…</div>
                      </TableCell>
                      <TableCell className="text-xs">{f.control_count}</TableCell>
                      <TableCell className="text-xs text-right">{formatNumber(Number(f.control_amount || 0), 2)}</TableCell>
                      <TableCell className="text-xs">{f.status}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1.5">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadEftFile(f)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {f.status === 'GENERATED' && (
                            <BnBusyButton loading={busy} size="icon" variant="ghost" className="h-7 w-7" disabled={busy}
                              onClick={() => run(() => markEftSubmitted(f.id, userCode), 'Marked submitted')}>
                              <Send className="h-3.5 w-3.5" />
                            </BnBusyButton>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {(eftFilesQ.data || []).some((f) => f.status === 'SUBMITTED') && (
            <div className="space-y-2">
              <Label className="text-xs">Bank Response (paste contents)</Label>
              <Textarea rows={3} value={responsePayload} onChange={(e) => setResponsePayload(e.target.value)} />
              <div className="flex gap-2">
                <BnBusyButton loading={busy} size="sm" variant="outline" disabled={busy || !responsePayload.trim()}
                  onClick={() => {
                    const f = (eftFilesQ.data || []).find((x) => x.status === 'SUBMITTED');
                    if (f) run(() => uploadEftResponse(f.id, responsePayload, 'ACK', userCode), 'Response stored');
                  }}>Mark Acknowledged</BnBusyButton>
                <BnBusyButton loading={busy} size="sm" variant="destructive" disabled={busy || !responsePayload.trim()}
                  onClick={() => {
                    const f = (eftFilesQ.data || []).find((x) => x.status === 'SUBMITTED');
                    if (f) run(() => uploadEftResponse(f.id, responsePayload, 'REJECTED', userCode), 'Marked rejected');
                  }}>Mark Rejected</BnBusyButton>
              </div>
            </div>
          )}
        </div>
      )}

      {isEft && isCheque && <Separator />}

      {isCheque && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Printer className="h-4 w-4" /> Cheque Print Controls
          </h3>

          {activeBooks.length === 0 ? (
            <div className="p-3 border rounded-md bg-muted/30 text-sm">
              <p className="font-medium">No active cheque books</p>
              <p className="text-muted-foreground text-xs mt-1">
                Register an active cheque stock book before assigning numbers.
              </p>
              <Button size="sm" variant="outline" className="mt-2" asChild>
                <Link to="/bn/cheque-stock">Go to Cheque Stock</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cheque Book / Bank Account</Label>
                <Select value={selectedBook} onValueChange={setSelectedBook}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select an active cheque book" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBooks.map((book) => (
                      <SelectItem key={book.bank_account_ref} value={book.bank_account_ref}>
                        {book.bank_account_ref} — {book.bank_code || 'Book'} ({book.series_prefix || ''}{book.next_number.toLocaleString()} next)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedStock && (
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>Prefix: <span className="font-mono">{selectedStock.series_prefix || '—'}</span></span>
                  <span>Next: <span className="font-mono">{selectedStock.series_prefix || ''}{selectedStock.next_number.toLocaleString()}</span></span>
                  <span>Range: <span className="font-mono">{selectedStock.series_prefix || ''}{selectedStock.range_start.toLocaleString()}–{selectedStock.series_prefix || ''}{selectedStock.range_end.toLocaleString()}</span></span>
                  <span>Remaining: <span className="font-mono">{Math.max(0, selectedStock.range_end - selectedStock.next_number + 1).toLocaleString()}</span></span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <Label className="text-xs">Cheque Date</Label>
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="h-8" />
                </div>
                <div>
                  <Label className="text-xs">Starting Number {selectedStock?.series_prefix ? `(${selectedStock.series_prefix}…)` : ''}</Label>
                  <Input
                    value={startingNumber}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '');
                      setStartingNumber(digitsOnly);
                      if (!digitsOnly) {
                        setStartingNumberError(null);
                        return;
                      }
                      const n = Number(digitsOnly);
                      if (!Number.isFinite(n)) {
                        setStartingNumberError('Enter a numeric value');
                      } else if (selectedStock && n < selectedStock.next_number) {
                        setStartingNumberError(`Must be at least ${selectedStock.next_number.toLocaleString()}`);
                      } else if (selectedStock && (n < selectedStock.range_start || n > selectedStock.range_end)) {
                        setStartingNumberError(`Outside range ${selectedStock.range_start.toLocaleString()}–${selectedStock.range_end.toLocaleString()}`);
                      } else {
                        setStartingNumberError(null);
                      }
                    }}
                    placeholder="auto"
                    className="h-8"
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                  {startingNumberError && <p className="text-[10px] text-destructive mt-1">{startingNumberError}</p>}
                </div>
                <BnBusyButton loading={busy}
                  size="sm"
                  disabled={!canExecute || busy || !selectedBook || !!startingNumberError}
                  onClick={() => run(
                    () => assignChequeNumbersForBatch({
                      batchId,
                      bankAccountRef: selectedBook,
                      chequeDate,
                      startingNumber: startingNumber ? Number(startingNumber) : undefined,
                      userCode,
                    }).then((r) => { if (!r.assigned) throw new Error('No cheques to assign'); }),
                    'Cheque numbers assigned',
                  )}
                >
                  Assign Cheque Numbers
                </BnBusyButton>
              </div>
            </div>
          )}

          {(chequesQ.data || []).length > 0 && (
            <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Cheque #</TableHead>
                    <TableHead className="text-xs">Payee</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(chequesQ.data || []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.cheque_number}</TableCell>
                      <TableCell className="text-xs">{c.payee_name}</TableCell>
                      <TableCell className="text-xs text-right">{formatNumber(Number(c.amount || 0), 2)}</TableCell>
                      <TableCell className="text-xs">{c.status}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1">
                          {c.status === 'ASSIGNED' && (
                            <BnBusyButton loading={busy} size="icon" variant="ghost" className="h-7 w-7" disabled={busy}
                              onClick={() => run(() => markPrinted([c.id], userCode), 'Marked printed')}>
                              <Printer className="h-3.5 w-3.5" />
                            </BnBusyButton>
                          )}
                          {(c.status === 'PRINTED' || c.status === 'REPRINTED') && (
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setReprintFor(c.id)}>
                              <RotateCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {c.status !== 'CANCELLED' && c.status !== 'DISPATCHED' && (
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setCancelFor(c.id)}>
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          {c.status !== 'DISPATCHED' && (
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => { setCorrectFor(c.id); setNewNumber(c.cheque_number); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(c.status === 'PRINTED' || c.status === 'REPRINTED') && (
                            <BnBusyButton loading={busy} size="icon" variant="ghost" className="h-7 w-7" disabled={busy}
                              onClick={() => run(() => markDispatched([c.id], dispatchRef || undefined, userCode), 'Dispatched')}>
                              <Truck className="h-3.5 w-3.5" />
                            </BnBusyButton>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(chequesQ.data || []).some((c) => c.status === 'ASSIGNED') && (
              <BnBusyButton loading={busy} size="sm" variant="outline" disabled={busy}
                onClick={() => run(
                  () => markPrinted((chequesQ.data || []).filter((c) => c.status === 'ASSIGNED').map((c) => c.id), userCode),
                  'All assigned cheques marked printed',
                )}>
                Mark All Printed
              </BnBusyButton>
            )}
            <ChequePrintView cheques={chequesQ.data || []} />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Dispatch Reference (for bulk dispatch)</Label>
              <Input value={dispatchRef} onChange={(e) => setDispatchRef(e.target.value)} className="h-8" />
            </div>
            <BnBusyButton loading={busy} size="sm" variant="outline" disabled={busy}
              onClick={() => run(
                () => markDispatched(
                  (chequesQ.data || []).filter((c) => c.status === 'PRINTED' || c.status === 'REPRINTED').map((c) => c.id),
                  dispatchRef || undefined, userCode,
                ),
                'Dispatched',
              )}>
              Dispatch Printed
            </BnBusyButton>
          </div>

          {/* Inline reason inputs */}
          {reprintFor && (
            <InlineReason
              label="Reprint reason" value={reprintReason} onChange={setReprintReason}
              onCancel={() => { setReprintFor(null); setReprintReason(''); }}
              onSubmit={() => run(() => reprintCheque(reprintFor!, reprintReason, userCode), 'Reprinted')
                .then(() => { setReprintFor(null); setReprintReason(''); })}
            />
          )}
          {cancelFor && (
            <InlineReason
              label="Cancellation reason" value={cancelReason} onChange={setCancelReason}
              onCancel={() => { setCancelFor(null); setCancelReason(''); }}
              onSubmit={() => run(() => cancelCheque(cancelFor!, cancelReason, userCode), 'Cancelled')
                .then(() => { setCancelFor(null); setCancelReason(''); })}
            />
          )}
          {correctFor && (
            <InlineReason
              label="New cheque number" value={newNumber} onChange={setNewNumber}
              onCancel={() => { setCorrectFor(null); setNewNumber(''); }}
              onSubmit={() => run(() => correctChequeNumber(correctFor!, newNumber, userCode), 'Corrected')
                .then(() => { setCorrectFor(null); setNewNumber(''); })}
            />
          )}
        </div>
      )}
    </div>
  );
};

const InlineReason: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  onCancel: () => void; onSubmit: () => void;
}> = ({ label, value, onChange, onCancel, onSubmit }) => (
  <div className="p-2 border rounded-md space-y-2 bg-muted/30">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
    <div className="flex gap-2 justify-end">
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button size="sm" disabled={!value.trim()} onClick={onSubmit}>Confirm</Button>
    </div>
  </div>
);
