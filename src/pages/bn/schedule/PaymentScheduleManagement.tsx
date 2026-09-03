/**
 * Payment Schedule Management — Main Page (Enhanced)
 *
 * Business Purpose: Plan one-time and recurring benefit disbursements.
 * Enhanced with schedule generation wizard, arrears calculator, and
 * bulk schedule-level actions.
 */
import React, { useState, useMemo } from 'react';
import { BnStatCard, BnEmptyState } from '@/components/bn/shared';
import { Button } from '@/components/ui/button';
import {
  CalendarDays, CheckCircle, PauseCircle, AlertTriangle,
  Clock, Loader2, RotateCcw, Banknote, Plus, PlayCircle,
} from 'lucide-react';
import { useBnScheduleRows } from '@/hooks/bn/useBnSchedule';
import { ScheduleFiltersBar } from '@/components/bn/schedule/ScheduleFiltersBar';
import { ScheduleGrid } from '@/components/bn/schedule/ScheduleGrid';
import { ScheduleRowDrawer } from '@/components/bn/schedule/ScheduleRowDrawer';
import { ScheduleActionBar } from '@/components/bn/schedule/ScheduleActionBar';
import { ScheduleGenerationWizard } from '@/components/bn/schedule/ScheduleGenerationWizard';
import type { ScheduleFilters, ScheduleMaturationResultRow } from '@/services/bn/scheduleService';
import { runScheduleMaturation, summariseMaturation } from '@/services/bn/scheduleService';
import { toast } from 'sonner';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XCD' }).format(n);

export default function PaymentScheduleManagement() {
  const [filters, setFilters] = useState<ScheduleFilters>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showGenWizard, setShowGenWizard] = useState(false);
  const [maturing, setMaturing] = useState(false);
  const [lastRun, setLastRun] = useState<ScheduleMaturationResultRow[] | null>(null);

  const { data: rows, isLoading, error, refetch } = useBnScheduleRows(filters);

  const handleRunMaturation = async () => {
    setMaturing(true);
    try {
      const result = await runScheduleMaturation({ performedBy: 'MANUAL' });
      const summary = summariseMaturation(result);
      setLastRun(result);
      toast.success(
        `Maturation complete — ${summary.matured} matured, ${summary.generated} payable(s) generated, ${summary.skipped} skipped`,
      );
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Maturation run failed');
    } finally {
      setMaturing(false);
    }
  };


  const stats = useMemo(() => {
    const items = rows ?? [];
    return {
      total: items.length,
      projected: items.filter(r => r.status === 'PROJECTED').length,
      due: items.filter(r => r.status === 'DUE').length,
      generated: items.filter(r => r.status === 'GENERATED').length,
      suspended: items.filter(r => r.status === 'SUSPENDED').length,
      arrears: items.filter(r => r.status === 'ARREARS').length,
      totalAmount: items
        .filter(r => !['CANCELLED', 'SKIPPED'].includes(r.status))
        .reduce((s, r) => s + (r.amount ?? 0), 0),
      generatedAmount: items
        .filter(r => r.status === 'GENERATED')
        .reduce((s, r) => s + (r.amount ?? 0), 0),
    };
  }, [rows]);

  if (error) {
    return (
      <div className="p-6">
        <BnEmptyState type="error" description="Could not load payment schedules." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Non-Production Banner */}
      <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-center text-sm font-medium text-amber-700 dark:text-amber-400">
        ⚠ Non-Production Environment — Payment Schedule Management
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-page-title">Payment Schedule Management</h1>
          <p className="t-page-subtitle mt-1">
            Plan one-time and recurring benefit disbursements. Schedule rows are orchestration
            records — issued payments persist in legacy payment tables (cl_cheques).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRunMaturation} disabled={maturing} className="gap-2">
            {maturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Run maturation now
          </Button>
          <Button onClick={() => setShowGenWizard(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Generate Schedule
          </Button>
        </div>
      </div>

      {lastRun && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 font-medium">Last maturation run</div>
          {lastRun.length === 0 ? (
            <p className="text-muted-foreground">No rows were due — nothing to mature.</p>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {lastRun.slice(0, 20).map((r, i) => (
                <li key={`${r.schedule_id ?? 'x'}-${i}`}>
                  {r.claim_number ?? '—'} · {r.due_date ?? '—'} · <span className="font-medium">{r.outcome}</span>
                  {r.reason ? ` (${r.reason})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}



      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <BnStatCard title="Total Rows" value={stats.total} icon={CalendarDays} />
        <BnStatCard title="Projected" value={stats.projected} icon={Clock} subtitle="Future" />
        <BnStatCard title="Due" value={stats.due} icon={AlertTriangle} subtitle="Ready to generate" />
        <BnStatCard title="Generated" value={stats.generated} icon={CheckCircle} subtitle="Instruction created" />
        <BnStatCard title="Suspended" value={stats.suspended} icon={PauseCircle} subtitle="On hold" />
        <BnStatCard title="Arrears" value={stats.arrears} icon={RotateCcw} subtitle="Catch-up" />
        <BnStatCard title="Scheduled Total" value={formatCurrency(stats.totalAmount)} icon={Banknote} subtitle="Active amount" />
        <BnStatCard title="Generated Total" value={formatCurrency(stats.generatedAmount)} icon={Banknote} subtitle="Instructions created" />
      </div>

      {/* Filters */}
      <ScheduleFiltersBar filters={filters} onChange={setFilters} totalCount={rows?.length ?? 0} />

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <ScheduleActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
        />
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <ScheduleGrid
          items={rows ?? []}
          onViewDetail={setViewingId}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Detail Drawer */}
      <ScheduleRowDrawer
        rowId={viewingId}
        onClose={() => setViewingId(null)}
      />

      {/* Generation Wizard */}
      <ScheduleGenerationWizard
        open={showGenWizard}
        onClose={() => setShowGenWizard(false)}
        onGenerated={() => refetch()}
      />
    </div>
  );
}
