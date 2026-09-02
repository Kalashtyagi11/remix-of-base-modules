import { useMemo, useState } from 'react';
import { PermissionWrapper } from '@/components/ui/permission-wrapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarRange, Loader2, Plus } from 'lucide-react';
import { formatDisplayDate } from '@/lib/dateFormat';
import {
  useCreateFiscalYear,
  useFiscalYears,
  useSetFiscalYearActive,
  useSetFiscalYearStatus,
  useUpdateFiscalYear,
} from '@/hooks/useFiscalYears';
import { isPlanningEligible, type FiscalYear, type FiscalYearStatus } from '@/services/core/fiscalCalendarService';

const EMPTY = {
  code: '',
  display_name: '',
  start_date: '',
  end_date: '',
  status: 'OPEN' as FiscalYearStatus,
  is_active: true,
  planning_open: true,
  notes: '',
};

/**
 * Enterprise Fiscal Calendar administration.
 *
 * Platform-level configuration surface (not an Internal Audit screen).
 * Fiscal years are never deleted — they are closed or deactivated.
 */
export default function FiscalCalendarAdmin() {
  const { data: years = [], isLoading } = useFiscalYears();
  const createYear = useCreateFiscalYear();
  const updateYear = useUpdateFiscalYear();
  const setActive = useSetFiscalYearActive();
  const setStatus = useSetFiscalYearStatus();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalYear | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const eligibleCount = useMemo(() => years.filter(isPlanningEligible).length, [years]);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const startEdit = (fy: FiscalYear) => {
    setEditing(fy);
    setForm({
      code: fy.code,
      display_name: fy.display_name,
      start_date: fy.start_date,
      end_date: fy.end_date,
      status: fy.status,
      is_active: fy.is_active,
      planning_open: fy.planning_open,
      notes: fy.notes || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.start_date || !form.end_date) return;
    if (form.start_date > form.end_date) return;
    const payload = {
      code: form.code.trim(),
      display_name: form.display_name.trim() || form.code.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.status,
      is_active: form.is_active,
      planning_open: form.planning_open,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await updateYear.mutateAsync({ id: editing.id, patch: payload });
    } else {
      await createYear.mutateAsync(payload);
    }
    setOpen(false);
  };

  const saving = createYear.isPending || updateYear.isPending;
  const rangeInvalid = Boolean(form.start_date && form.end_date && form.start_date > form.end_date);

  return (
    <PermissionWrapper moduleName="system_administration">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              Fiscal Calendar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enterprise fiscal year master. All modules — including Internal Audit planning — select
              fiscal years from this list. Creating a fiscal year is an explicit administrative action.
            </p>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1" /> Create Fiscal Year
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Fiscal Years Defined</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{years.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Eligible for Planning</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{eligibleCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Calendar Convention</CardTitle></CardHeader>
            <CardContent className="text-sm">
              January – December (fiscal year start month = 1)
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Planning</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!isLoading && years.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No fiscal years configured.</TableCell></TableRow>
                )}
                {years.map((fy) => (
                  <TableRow key={fy.id}>
                    <TableCell className="font-medium">{fy.code}</TableCell>
                    <TableCell>{fy.display_name}</TableCell>
                    <TableCell>{formatDisplayDate(fy.start_date)}</TableCell>
                    <TableCell>{formatDisplayDate(fy.end_date)}</TableCell>
                    <TableCell><Badge variant={fy.status === 'CLOSED' ? 'secondary' : 'default'}>{fy.status}</Badge></TableCell>
                    <TableCell>
                      {isPlanningEligible(fy)
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">Open</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Closed</Badge>}
                    </TableCell>
                    <TableCell>{fy.is_active ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(fy)}>Edit</Button>
                      {fy.status !== 'CLOSED' ? (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: fy.id, status: 'CLOSED' })}>Close</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: fy.id, status: 'OPEN' })}>Reopen</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: fy.id, isActive: !fy.is_active })}>
                        {fy.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.code}` : 'Create Fiscal Year'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Code <span className="text-destructive">*</span></Label>
                  <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="FY2031" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Display Name</Label>
                  <Input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="FY2031" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              {rangeInvalid && <p className="text-xs text-destructive">Start date must be on or before the end date.</p>}
              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as FiscalYearStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.planning_open} onCheckedChange={(v) => setForm((f) => ({ ...f, planning_open: v }))} />
                  <Label className="text-xs">Open for planning</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                  <Label className="text-xs">Active</Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Fiscal years may not overlap within the organisation. Historical years are never deleted —
                close or deactivate them instead.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || rangeInvalid || !form.code.trim() || !form.start_date || !form.end_date}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Fiscal Year'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionWrapper>
  );
}
