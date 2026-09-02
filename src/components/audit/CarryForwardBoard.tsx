import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowRight, Calendar, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useCarryForwardItems, useBuildCarryForward } from '@/hooks/useAuditCommunicationStages';
import { PageShell, DataTable, StatusBadge } from '@/components/common';
import type { DataTableColumn } from '@/components/common';

interface CarryForwardBoardProps {
  currentFiscalYear?: string;
}

export function CarryForwardBoard({ currentFiscalYear }: CarryForwardBoardProps) {
  // Fiscal years come from the enterprise master (core_fiscal_year); they are
  // never free text. Targets must additionally be planning-eligible.
  const { data: fiscalYears = [] } = useFiscalYears();
  const eligibleTargets = fiscalYears.filter(isPlanningEligible);
  const defaultTarget = currentFiscalYear || eligibleTargets[0]?.code || '';
  const [selectedYear, setSelectedYear] = useState(defaultTarget);
  const [sourceYear, setSourceYear] = useState('');

  useEffect(() => {
    if (!selectedYear && eligibleTargets.length) setSelectedYear(eligibleTargets[0].code);
    if (!sourceYear && fiscalYears.length) {
      const target = fiscalYears.find(f => f.code === (selectedYear || eligibleTargets[0]?.code));
      const prior = fiscalYears.find(f => !target || f.start_date < target.start_date);
      if (prior) setSourceYear(prior.code);
    }
  }, [fiscalYears, eligibleTargets, selectedYear, sourceYear]);


  const { data: items = [], isLoading } = useCarryForwardItems(selectedYear);
  const buildCarryForward = useBuildCarryForward();

  const handleBuild = () => {
    buildCarryForward.mutate({ sourceYear, targetYear: selectedYear });
  };

  const isOverdue = (item: any) => {
    if (!item.target_resolution_date || item.status === 'Resolved') return false;
    return new Date(item.target_resolution_date) < new Date();
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: 'source_reference',
      header: 'Source',
      render: (item) => (
        <div>
          <span className="font-medium text-sm">{item.source_reference || '-'}</span>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (item) => <StatusBadge status={item.priority || 'Medium'} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <div className="flex items-center gap-1">
          <StatusBadge status={item.status || 'Carried Forward'} />
          {isOverdue(item) && <Badge variant="destructive" className="text-[9px]">Overdue</Badge>}
        </div>
      ),
    },
    {
      key: 'target_resolution_date',
      header: 'Target Date',
      render: (item) => item.target_resolution_date ? (
        <span className={`text-sm ${isOverdue(item) ? 'text-destructive font-medium' : ''}`}>
          {new Date(item.target_resolution_date).toLocaleDateString()}
        </span>
      ) : '-',
    },
    {
      key: 'escalation_count',
      header: 'Escalations',
      render: (item) => (
        <div className="text-center">
          {(item.escalation_count || 0) > 0 ? (
            <Badge variant="destructive" className="text-[10px]">{item.escalation_count}×</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Carried On',
      render: (item) => item.created_at ? new Date(item.created_at).toLocaleDateString() : '-',
    },
  ];

  const overdueCount = items.filter(isOverdue).length;
  const resolvedCount = items.filter((i: any) => i.status === 'Resolved').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Prior Audit Carry-Forward
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{items.length} items</Badge>
            {overdueCount > 0 && <Badge variant="destructive" className="text-[10px]">{overdueCount} overdue</Badge>}
            <Badge className="bg-green-100 text-green-800 text-[10px]">{resolvedCount} resolved</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Build controls */}
        <div className="flex items-end gap-3 p-3 rounded-md bg-muted/50 border">
          <div className="space-y-1">
            <Label className="text-xs">Source Year</Label>
            <Input value={sourceYear} onChange={e => setSourceYear(e.target.value)} className="h-8 w-24 text-sm" />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground mb-2" />
          <div className="space-y-1">
            <Label className="text-xs">Target Year</Label>
            <Input value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="h-8 w-24 text-sm" />
          </div>
          <Button size="sm" className="h-8" onClick={handleBuild} disabled={buildCarryForward.isPending}>
            {buildCarryForward.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Build Carry-Forward
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No carry-forward items for {selectedYear}. Use "Build Carry-Forward" to import unresolved findings from a prior year.
          </div>
        ) : (
          <DataTable columns={columns} data={items} />
        )}
      </CardContent>
    </Card>
  );
}
