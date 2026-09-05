import React, { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { BnStatusBadge } from '@/components/bn/shared/BnStatusBadge';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Loader2, Star } from 'lucide-react';
import type { PostIssueTask } from '@/services/bn/postIssueService';

import { formatNumber } from '@/lib/culture/culture';
const TYPE_LABELS: Record<string, string> = {
  CL_HEAD_UPDATE: 'Claim Header',
  CLAIM_CLOSURE: 'Claim Closure',
  CLAIM_CONTINUATION: 'Claim Continuation',
  WAGES_CREDITED: 'Wages Credited',
  POSTAL_REG_UPDATE: 'Postal Registration',
  PENSION_SUPPORT: 'Pension Support',
  SURVIVOR_FOLLOWUP: 'Survivor Follow-up',
  HOLDING_FOLLOWUP: 'Holding Follow-up',
  ENTITLEMENT_UPDATE: 'Entitlement Update',
  INSTRUCTION_FINALIZE: 'Instruction Finalize',
  BATCH_COMPLETION_CHECK: 'Batch Check',
  AUDIT_COMPLETION: 'Audit Completion',
};

const DONE_STATUSES = ['COMPLETED', 'SKIPPED', 'CANCELLED'];

interface Props {
  tasks: PostIssueTask[];
  isLoading: boolean;
  onSelect: (task: PostIssueTask) => void;
}

interface PaymentGroup {
  issueRecordId: string;
  ssn: string;
  claimNumber: string | null;
  chequeNumber: string | null;
  amount: number;
  tasks: PostIssueTask[];
  doneCount: number;
  requiredPending: number;
  failedCount: number;
}

export const PostIssueTaskList: React.FC<Props> = ({ tasks, isLoading, onSelect }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo<PaymentGroup[]>(() => {
    const byRecord = new Map<string, PaymentGroup>();
    for (const t of tasks) {
      let g = byRecord.get(t.issue_record_id);
      if (!g) {
        g = {
          issueRecordId: t.issue_record_id,
          ssn: t.ssn,
          claimNumber: t.claim_number,
          chequeNumber: t.cheque_number,
          amount: t.amount,
          tasks: [],
          doneCount: 0,
          requiredPending: 0,
          failedCount: 0,
        };
        byRecord.set(t.issue_record_id, g);
      }
      g.tasks.push(t);
      if (DONE_STATUSES.includes(t.status)) g.doneCount += 1;
      if (t.is_required && !DONE_STATUSES.includes(t.status)) g.requiredPending += 1;
      if (t.status === 'FAILED') g.failedCount += 1;
    }
    for (const g of byRecord.values()) {
      g.tasks.sort((a, b) => a.task_order - b.task_order);
    }
    return [...byRecord.values()].sort((a, b) =>
      (a.claimNumber || '').localeCompare(b.claimNumber || ''),
    );
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No post-issue tasks found matching current filters.
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold text-xs w-8" />
            <TableHead className="font-semibold text-xs">Payment</TableHead>
            <TableHead className="font-semibold text-xs">SSN</TableHead>
            <TableHead className="font-semibold text-xs">Cheque/Ref</TableHead>
            <TableHead className="font-semibold text-xs text-right">Amount</TableHead>
            <TableHead className="font-semibold text-xs">Checklist Progress</TableHead>
            <TableHead className="font-semibold text-xs">Attention</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => {
            const isOpen = !!expanded[g.issueRecordId];
            return (
              <React.Fragment key={g.issueRecordId}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => toggle(g.issueRecordId)}
                >
                  <TableCell className="w-8">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {g.claimNumber || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{g.ssn}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {g.chequeNumber || '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatNumber(g.amount, 2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-normal">
                        {g.doneCount} / {g.tasks.length} done
                      </Badge>
                      {g.requiredPending === 0 ? (
                        <BnStatusBadge status="COMPLETED" dot size="sm" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {g.requiredPending} required pending
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {g.failedCount > 0 && (
                      <Badge variant="destructive" className="text-xs font-normal">
                        {g.failedCount} failed
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
                {isOpen &&
                  g.tasks.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer bg-muted/10 hover:bg-muted/30"
                      onClick={() => onSelect(t)}
                    >
                      <TableCell />
                      <TableCell className="text-xs pl-6" colSpan={2}>
                        <span className="font-mono text-muted-foreground mr-2">
                          {t.task_order}.
                        </span>
                        <span className="font-medium">
                          {TYPE_LABELS[t.task_type] || t.task_type}
                        </span>
                        {t.is_required && (
                          <Star className="inline-block ml-1.5 h-3 w-3 text-amber-500 fill-amber-500 align-text-top" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.cheque_number || '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(t.amount, 2)}
                      </TableCell>
                      <TableCell>
                        <BnStatusBadge status={t.status} dot size="sm" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.retry_count > 0 ? `${t.retry_count}/${t.max_retries}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
