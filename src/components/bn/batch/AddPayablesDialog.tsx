import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useBnAvailablePayablesDetailed } from '@/hooks/bn/useBnBatchOperations';

import { formatNumber } from '@/lib/culture/culture';
interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (payableIds: string[]) => Promise<void>;
  paymentMethod?: string;
  officeCode?: string;
  isAdding: boolean;
}

export const AddPayablesDialog: React.FC<Props> = ({
  open, onClose, onAdd, paymentMethod, officeCode, isAdding,
}) => {
  const { data, isLoading } = useBnAvailablePayablesDetailed(paymentMethod, officeCode);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const matching: any[] = data?.matching ?? [];
  const allReady: any[] = data?.all ?? [];
  const payables = showAll ? allReady : matching;

  const mismatched = useMemo(
    () => new Set(showAll ? allReady.filter((p) => !matching.some((m) => m.id === p.id)).map((p) => p.id) : []),
    [showAll, allReady, matching],
  );

  const toggleAll = () => {
    if (selected.size === payables.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(payables.map((p: any) => p.id)));
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleAdd = async () => {
    await onAdd(Array.from(selected));
    setSelected(new Set());
  };

  const totalAmount = payables
    .filter((p: any) => selected.has(p.id))
    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const batchLabel = `${paymentMethod || 'ANY METHOD'}${officeCode ? ` / ${officeCode}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payables to Batch</DialogTitle>
          <DialogDescription>
            Select READY payable instructions to include in this batch ({batchLabel}).
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {matching.length === 0 && (
              <Alert variant="default">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {data?.totalReady
                    ? (
                      <>
                        No payable matches this batch, but {data.totalReady} READY unbatched
                        payable{data.totalReady === 1 ? '' : 's'} exist
                        {data.excludedByMethod > 0 && <> — {data.excludedByMethod} excluded by payment method (batch is {paymentMethod})</>}
                        {data.excludedByOffice > 0 && <> — {data.excludedByOffice} excluded by office (batch is {officeCode})</>}
                        . Create a batch matching those payables, or review them below.
                      </>
                    )
                    : 'There are no READY unbatched payable instructions at all.'}
                </AlertDescription>
              </Alert>
            )}

            {allReady.length > matching.length && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={showAll} onCheckedChange={(v) => { setShowAll(!!v); setSelected(new Set()); }} />
                Show all methods / offices ({allReady.length} total)
              </label>
            )}

            {payables.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No eligible payable instructions available.
              </p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selected.size === payables.length && payables.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs">SSN</TableHead>
                      <TableHead className="text-xs">Claim</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Method / Office</TableHead>
                      <TableHead className="text-xs">Period</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.ssn}</TableCell>
                        <TableCell className="text-xs">{p.claim_number || '—'}</TableCell>
                        <TableCell className="text-xs">{p.instruction_type}</TableCell>
                        <TableCell className="text-xs">
                          <span className="mr-1">{p.payment_method || '—'} / {p.office_code || 'any'}</span>
                          {mismatched.has(p.id) && (
                            <Badge variant="outline" className="text-[10px]">mismatch</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.period_start && p.period_end
                            ? `${p.period_start} – ${p.period_end}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber((p.amount || 0), 2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selected.size} selected • Total: {formatNumber(totalAmount, 2)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isAdding}>Cancel</Button>
            <Button onClick={handleAdd} disabled={selected.size === 0 || isAdding}>
              {isAdding && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add {selected.size} Payable{selected.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
