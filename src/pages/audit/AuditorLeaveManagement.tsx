import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Clock, Plus, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import { PageShell, StatusBadge } from '@/components/common';
import { DataTable } from '@/components/common';
import type { DataTableColumn } from '@/components/common';
import { useIALeaveRequests, useIALeaveRequestMutations, useIAActiveAuditors } from '@/hooks/useAuditData';
import { formatDateForDisplay } from '@/lib/format-config';
import { useUserCode } from '@/hooks/useUserCode';
import { differenceInBusinessDays, parseISO } from 'date-fns';

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Training', 'Compensatory', 'Other'];

export default function AuditorLeaveManagement() {
  const { data: leaveRequests = [], isLoading } = useIALeaveRequests();
  const { data: auditors = [] } = useIAActiveAuditors();
  const mutations = useIALeaveRequestMutations();
  const { userCode } = useUserCode();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterAuditor, setFilterAuditor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({
    auditor_id: '',
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    reason: '',
  });

  const auditorMap = useMemo(() => new Map(auditors.map((a: any) => [a.id, a.name])), [auditors]);

  const filtered = useMemo(() => {
    let result = leaveRequests;
    if (filterAuditor !== 'all') result = result.filter((r: any) => r.auditor_id === filterAuditor);
    if (filterStatus !== 'all') result = result.filter((r: any) => r.status === filterStatus);
    return result;
  }, [leaveRequests, filterAuditor, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const pending = leaveRequests.filter((r: any) => r.status === 'Pending').length;
    const approved = leaveRequests.filter((r: any) => r.status === 'Approved').length;
    const rejected = leaveRequests.filter((r: any) => r.status === 'Rejected').length;
    const totalDays = leaveRequests
      .filter((r: any) => r.status === 'Approved' && r.start_date && r.end_date)
      .reduce((sum: number, r: any) => sum + Math.max(1, differenceInBusinessDays(parseISO(r.end_date), parseISO(r.start_date)) + 1), 0);
    return { pending, approved, rejected, totalDays };
  }, [leaveRequests]);

  const handleSubmit = () => {
    mutations.create.mutate({
      ...form,
      status: 'Pending',
      created_by: userCode,
    });
    setDialogOpen(false);
    setForm({ auditor_id: '', leave_type: 'Annual Leave', start_date: '', end_date: '', reason: '' });
  };

  const handleApprove = (id: string) => {
    mutations.updateStatus.mutate({ id, status: 'Approved' });
  };

  const handleReject = (id: string) => {
    mutations.updateStatus.mutate({ id, status: 'Rejected' });
  };

  const columns: DataTableColumn<any>[] = [
    { key: 'request_id', header: 'Request ID', render: (r) => <span className="font-mono text-xs">{r.request_id || '—'}</span> },
    { key: 'auditor_id', header: 'Auditor', render: (r) => <span className="font-medium">{auditorMap.get(r.auditor_id) || 'Unknown'}</span> },
    { key: 'leave_type', header: 'Type', render: (r) => <Badge variant="outline">{r.leave_type}</Badge> },
    { key: 'start_date', header: 'Period', render: (r) => (
      <div className="text-xs">
        <span>{formatDateForDisplay(r.start_date)}</span>
        <span className="text-muted-foreground"> → </span>
        <span>{formatDateForDisplay(r.end_date)}</span>
        {r.start_date && r.end_date && (
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {Math.max(1, differenceInBusinessDays(parseISO(r.end_date), parseISO(r.start_date)) + 1)}d
          </Badge>
        )}
      </div>
    )},
    { key: 'reason', header: 'Reason', render: (r) => <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{r.reason || '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status || 'Pending'} /> },
  ];

  return (
    <PageShell
      title="Auditor Leave Management"
      subtitle="Track and manage auditor leave schedules for capacity planning"
      breadcrumbs={[{ label: 'Internal Audit', href: '/audit/dashboard' }, { label: 'Leave Management' }]}
      isLoading={isLoading}
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /><div><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-semibold">{stats.pending}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Approved</p><p className="text-lg font-semibold">{stats.approved}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /><div><p className="text-xs text-muted-foreground">Rejected</p><p className="text-lg font-semibold">{stats.rejected}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Total Leave Days</p><p className="text-lg font-semibold">{stats.totalDays}</p></div></div></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterAuditor} onValueChange={setFilterAuditor}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Auditors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Auditors</SelectItem>
            {auditors.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Leave Request
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={filtered}
            renderActions={(row) => (
              <div className="flex gap-1">
                {row.status === 'Pending' && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleApprove(row.id)}>
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleReject(row.id)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
            emptyMessage="No leave requests found."
          />
        </CardContent>
      </Card>

      {/* New Leave Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Auditor *</Label>
              <Select value={form.auditor_id} onValueChange={(v) => setForm({ ...form, auditor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select auditor" /></SelectTrigger>
                <SelectContent>
                  {auditors.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional reason for leave" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.auditor_id || !form.start_date || !form.end_date}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
