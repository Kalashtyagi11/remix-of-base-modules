/**
 * Batch Operations Management Page (Enhanced)
 *
 * Business Purpose: Group payable instructions into controlled payment batches
 * before issue to cl_cheques. Enhanced with issue progress tracking and
 * maker-checker indicators.
 */
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Package, Plus, CheckCircle2, ShieldCheck, Rocket,
  AlertTriangle, XCircle, RotateCcw, Loader2,
} from 'lucide-react';
import { useBnBatches, useBnBatchSummary, useExecuteBatchAction } from '@/hooks/bn/useBnBatchOperations';
import { BatchListTable } from '@/components/bn/batch/BatchListTable';
import { BatchDetailDrawer } from '@/components/bn/batch/BatchDetailDrawer';
import { BatchFiltersBar } from '@/components/bn/batch/BatchFiltersBar';
import { BatchCreateDialog } from '@/components/bn/batch/BatchCreateDialog';
import { BatchIssueProgress } from '@/components/bn/batch/BatchIssueProgress';
import type { BatchFilters, BnPaymentBatch } from '@/services/bn/batchOperationsService';

const STAT_CARDS = [
  { key: 'TOTAL', label: 'Total', icon: Package, color: 'text-foreground' },
  { key: 'OPEN', label: 'Open', icon: Plus, color: 'text-blue-600' },
  { key: 'VALIDATED', label: 'Validated', icon: CheckCircle2, color: 'text-amber-600' },
  { key: 'APPROVED', label: 'Approved', icon: ShieldCheck, color: 'text-emerald-600' },
  { key: 'RELEASED', label: 'Released', icon: Rocket, color: 'text-teal-600' },
  { key: 'ISSUED', label: 'Issued', icon: CheckCircle2, color: 'text-green-600' },
  { key: 'PARTIALLY_ISSUED', label: 'Partial', icon: AlertTriangle, color: 'text-orange-600' },
  { key: 'CANCELLED', label: 'Cancelled', icon: XCircle, color: 'text-muted-foreground' },
];

export default function BatchOperations() {
  const [filters, setFilters] = useState<BatchFilters>({});
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: batches = [], isLoading } = useBnBatches(filters);
  const { data: summary = {} } = useBnBatchSummary();
  const executeMutation = useExecuteBatchAction();

  // Find batches in active issue state for progress tracking
  const issuingBatches = batches.filter(b =>
    ['RELEASED', 'PARTIALLY_ISSUED'].includes(b.status) && b.issue_started_at
  );

  const handleAction = async (params: any) => {
    try {
      const result: any = await executeMutation.mutateAsync(params);

      // ISSUE reports per-item outcomes: zero issued with failures is a failure,
      // not a success, and must not be reported as a completed action.
      if (params.action === 'ISSUE' && result && typeof result.issued === 'number') {
        const { issued, failed, firstError } = result;
        if (issued === 0 && failed > 0) {
          toast.error(firstError ? `Issue failed: ${firstError}` : 'Issue failed for all items');
          return;
        }
        if (failed > 0) {
          toast.warning(`Issued ${issued}, failed ${failed}${firstError ? ` — ${firstError}` : ''}`);
          return;
        }
        toast.success(`Issued ${issued} payment${issued === 1 ? '' : 's'}`);
        setSelectedBatchId(null);
        return;
      }

      toast.success(`Batch action "${params.action}" completed`);
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-page-title">Batch Operations</h1>
          <p className="t-page-subtitle mt-1">
            Group payable instructions into controlled payment batches before issue.
            Maker-checker controls enforced: creator ≠ approver.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Batch
        </Button>
      </div>

      {/* Issue Progress Trackers */}
      {issuingBatches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Active Issue Operations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {issuingBatches.map(b => (
              <BatchIssueProgress key={b.id} batch={b} />
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key} className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilters(f => ({ ...f, status: key === 'TOTAL' ? undefined : key as any }))}>
            <CardContent className="p-3 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <div className="text-lg font-bold">{summary[key] || 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <BatchFiltersBar filters={filters} onChange={setFilters} />

      {/* Table */}
      <BatchListTable
        batches={batches}
        isLoading={isLoading}
        onSelect={(b) => setSelectedBatchId(b.id)}
      />

      {/* Detail Drawer */}
      <BatchDetailDrawer
        batchId={selectedBatchId}
        open={!!selectedBatchId}
        onClose={() => setSelectedBatchId(null)}
        onAction={handleAction}
        isActing={executeMutation.isPending}
      />

      {/* Create Dialog */}
      <BatchCreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onAction={handleAction}
        isActing={executeMutation.isPending}
      />
    </div>
  );
}
