/**
 * Post-Issue Review Page
 *
 * Business Purpose: Control all claim-side and support-table updates after payment issue.
 * Issue is NOT complete until all required post-issue tasks finish.
 */
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  ListChecks, Clock, Loader2, CheckCircle2, XCircle, SkipForward,
  Pause, Zap, RefreshCw, Inbox,
} from 'lucide-react';
import {
  useBnPostIssueTasks, useBnPostIssueSummary,
  useExecutePostIssueAction, useExecuteAllPendingTasks,
  useGeneratePostIssueTasks, useBnPostIssueMissingCount,
} from '@/hooks/bn/useBnPostIssue';
import { PostIssueTaskList } from '@/components/bn/postissue/PostIssueTaskList';
import { PostIssueTaskDrawer } from '@/components/bn/postissue/PostIssueTaskDrawer';
import { PostIssueFiltersBar } from '@/components/bn/postissue/PostIssueFiltersBar';
import type { PostIssueFilters } from '@/services/bn/postIssueService';
import { useActorUserCode } from '@/hooks/bn/useActorUserCode';

const STAT_CARDS = [
  { key: 'total', label: 'Total', icon: ListChecks, color: 'text-foreground' },
  { key: 'pending', label: 'Pending', icon: Clock, color: 'text-amber-600' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-green-600' },
  { key: 'failed', label: 'Failed', icon: XCircle, color: 'text-destructive' },
  { key: 'skipped', label: 'Skipped', icon: SkipForward, color: 'text-muted-foreground' },
  { key: 'deferred', label: 'Deferred', icon: Pause, color: 'text-violet-600' },
];

export default function PostIssueReview() {
  // Writes must name a person, never the 'CURRENT_USER' placeholder.
  const { actor } = useActorUserCode();

  const [filters, setFilters] = useState<PostIssueFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useBnPostIssueTasks(filters);
  const { data: summary } = useBnPostIssueSummary(filters.batch_id);
  const actionMutation = useExecutePostIssueAction();
  const bulkMutation = useExecuteAllPendingTasks();
  const generateMutation = useGeneratePostIssueTasks();
  const { data: missingCount = 0 } = useBnPostIssueMissingCount();

  const handleGenerate = async () => {
    try {
      const created = await generateMutation.mutateAsync({
        batchId: filters.batch_id,
        userCode: actor(),
      });
      toast.success(
        created > 0
          ? `Generated ${created} post-issue task(s)`
          : 'Every issued payment already has its checklist',
      );
    } catch (err: any) {
      toast.error(err.message || 'Could not generate post-issue tasks');
    }
  };

  const handleAction = async (params: any) => {
    try {
      await actionMutation.mutateAsync(params);
      toast.success(`Task action "${params.action}" completed`);
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    }
  };

  const handleBulkExecute = async () => {
    if (!filters.batch_id) {
      toast.error('Select a batch first to run bulk execution');
      return;
    }
    try {
      const result = await bulkMutation.mutateAsync({
        batchId: filters.batch_id,
        userCode: actor(),
      });
      toast.success(`Completed: ${result.completed}, Failed: ${result.failed}`);
    } catch (err: any) {
      toast.error(err.message || 'Bulk execution failed');
    }
  };

  const pendingCount = tasks.filter(t => t.status === 'PENDING').length;
  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-page-title">Post-Issue Review</h1>
          <p className="t-page-subtitle mt-1">
            Complete claim-side and support-table updates after payment issue
          </p>
        </div>
        <div className="flex items-center gap-2">
        {missingCount > 0 && (
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="gap-2"
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate tasks ({missingCount})
          </Button>
        )}
        {pendingCount > 0 && filters.batch_id && (
          <Button
            onClick={handleBulkExecute}
            disabled={bulkMutation.isPending}
            className="gap-2"
          >
            {bulkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Execute All Pending ({pendingCount})
          </Button>
        )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="p-3 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <div className="text-lg font-bold">{summary?.[key as keyof typeof summary] ?? 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completion Progress */}
      {summary && summary.total > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Overall Completion
                {summary.allRequiredDone && (
                  <span className="ml-2 text-xs text-emerald-600 font-semibold">
                    ✓ All required tasks complete
                  </span>
                )}
              </span>
              <span className="text-sm font-mono">{summary.completionPct}%</span>
            </div>
            <Progress value={summary.completionPct} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <PostIssueFiltersBar filters={filters} onChange={setFilters} />

      {/* Task List — with an explanatory empty state */}
      {!isLoading && tasks.length === 0 && !hasActiveFilters ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            {missingCount > 0 ? (
              <>
                <div className="text-sm font-medium">
                  {missingCount} issued payment(s) have no post-issue checklist yet
                </div>
                <p className="max-w-md text-xs text-muted-foreground">
                  These payments were issued before the checklist was created automatically.
                  Generate the tasks to bring them into review.
                </p>
                <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="gap-2">
                  {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Generate tasks
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">No post-issue tasks yet</div>
                <p className="max-w-md text-xs text-muted-foreground">
                  Tasks appear here automatically once a payment is issued. Issue a payment batch
                  to start the post-issue checklist.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <PostIssueTaskList
          tasks={tasks}
          isLoading={isLoading}
          onSelect={(t) => setSelectedId(t.id)}
        />
      )}

      {/* Detail Drawer */}
      <PostIssueTaskDrawer
        taskId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        onAction={handleAction}
        isActing={actionMutation.isPending}
      />
    </div>
  );
}
