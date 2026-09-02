import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, Stethoscope } from 'lucide-react';
import { PageShell } from '@/components/common';
import { useFiscalConfigurationHealth, type FiscalHealthCheck } from '@/hooks/useFiscalConfigurationHealth';

const severityBadge = (check: FiscalHealthCheck) => {
  if (check.status === 'PASS') {
    return <Badge className="bg-emerald-100 text-emerald-800">PASS</Badge>;
  }
  if (check.status === 'HISTORICAL') {
    return <Badge variant="outline">HISTORICAL</Badge>;
  }
  return (
    <Badge variant={check.severity === 'CRITICAL' ? 'destructive' : 'secondary'}>
      {check.severity}
    </Badge>
  );
};

/**
 * Internal Audit → Configuration Health (fiscal domain).
 *
 * Diagnostics only. Server validation remains authoritative; this surface fails
 * configuration at entry rather than at report issuance. Historical records
 * created before the enterprise fiscal calendar existed are reported as
 * historical context, never as current blockers.
 */
export default function AuditConfigurationHealth() {
  const { data: checks = [], isLoading, isFetching, refetch } = useFiscalConfigurationHealth();

  const counts = useMemo(() => {
    const failing = checks.filter(c => c.status === 'FAIL');
    return {
      critical: failing.filter(c => c.severity === 'CRITICAL').length,
      warning: failing.filter(c => c.severity === 'WARNING').length,
      historical: checks.filter(c => c.status === 'HISTORICAL').length,
      passing: checks.filter(c => c.status === 'PASS').length,
    };
  }, [checks]);

  return (
    <PageShell
      title="Configuration Health"
      description="Live fiscal calendar and master-data diagnostics for Internal Audit"
      icon={Stethoscope}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Re-check
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Critical blockers</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            {counts.critical === 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              : <AlertTriangle className="h-5 w-5 text-destructive" />}
            {counts.critical}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Warnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{counts.warning}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Historical</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />{counts.historical}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Checks passing</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{counts.passing}</CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Fiscal calendar checks</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="w-28">Result</TableHead>
                  <TableHead className="w-24">Records</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="w-32">Drill-down</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map(check => (
                  <TableRow key={check.check_code}>
                    <TableCell>
                      <div className="font-medium text-sm">{check.title}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{check.check_code}</div>
                    </TableCell>
                    <TableCell>{severityBadge(check)}</TableCell>
                    <TableCell className="text-sm">{check.affected_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{check.detail}</TableCell>
                    <TableCell>
                      <Link to={check.drill_ref} className="text-sm text-primary hover:underline">Open</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
