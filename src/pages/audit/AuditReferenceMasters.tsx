/**
 * Internal Audit → Reference Masters (Stage 2B).
 *
 * Administration surface for the governed IA reference master. All mutations go
 * through server commands guarded by audit_configuration.configure; consuming
 * roles (HIA operational, Lead Auditor, Team Member, Quality Reviewer,
 * Management Respondent) can read but cannot configure. Values are retired by
 * deactivation, never deleted.
 */
import { useMemo, useState } from 'react';
import { PageShell } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Power, PowerOff, Pencil } from 'lucide-react';
import {
  useIaReferenceValues,
  useIaReferenceMigrationMap,
  useCreateIaReferenceValue,
  useUpdateIaReferenceValue,
  useSetIaReferenceValueActive,
  type IaReferenceTypeCode,
  type IaReferenceValue,
} from '@/hooks/audit/useIaReferenceValues';

const TYPES: { code: IaReferenceTypeCode; label: string; note: string }[] = [
  { code: 'AUDIT_TYPE', label: 'Audit / Engagement Type', note: 'Nature of the engagement (DEF-E2E-007)' },
  { code: 'COVERAGE_CATEGORY', label: 'Coverage Category', note: 'Plan coverage basis — risk bands are rejected here (DEF-E2E-008)' },
  { code: 'FOLLOW_UP_TYPE', label: 'Follow-Up Type', note: 'Nature of a follow-up activity' },
];

function ReferenceTypePanel({ type }: { type: IaReferenceTypeCode }) {
  const { data = [], isLoading } = useIaReferenceValues(type, { includeInactive: true });
  const create = useCreateIaReferenceValue();
  const update = useUpdateIaReferenceValue();
  const setActive = useSetIaReferenceValueActive();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IaReferenceValue | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', display_order: 0 });

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', description: '', display_order: (data.length + 1) * 10 });
    setOpen(true);
  };
  const openEdit = (row: IaReferenceValue) => {
    setEditing(row);
    setForm({ code: row.code, name: row.name, description: row.description || '', display_order: row.display_order });
    setOpen(true);
  };

  const submit = async () => {
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        patch: { name: form.name, description: form.description, display_order: form.display_order },
      });
    } else {
      await create.mutateAsync({
        reference_type: type,
        code: form.code,
        name: form.name,
        description: form.description || null,
        display_order: form.display_order,
      });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" /> New value</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">Order</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id} className={r.is_active ? '' : 'opacity-60'}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.description}</TableCell>
                    <TableCell>{r.display_order}</TableCell>
                    <TableCell>
                      {r.is_active
                        ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge>
                        : <Badge variant="outline">Retired</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActive.mutate({ id: r.id, isActive: !r.is_active, reason: 'Reference master administration' })}
                      >
                        {r.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit reference value' : 'New reference value'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                disabled={!!editing}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="STABLE_CODE"
              />
              {editing && <p className="text-xs text-muted-foreground mt-1">Codes are immutable once transactions may reference them.</p>}
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label>Display order</Label>
              <Input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm(f => ({ ...f, display_order: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending || !form.name || (!editing && !form.code)}>
              {(create.isPending || update.isPending) && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReconciliationPanel() {
  const { data = [], isLoading } = useIaReferenceMigrationMap();
  const grouped = useMemo(() => data, [data]);
  if (isLoading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Historical reconciliation — no silent coercion</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concept</TableHead>
              <TableHead>Legacy value</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Canonical code</TableHead>
              <TableHead className="w-24">Rows</TableHead>
              <TableHead>Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.reference_type}</TableCell>
                <TableCell>{r.legacy_value ?? <span className="text-muted-foreground">(null)</span>}</TableCell>
                <TableCell>
                  <Badge variant={r.classification === 'SEMANTICALLY_INVALID' ? 'destructive' : 'outline'}>
                    {r.classification}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.canonical_code ?? '—'}</TableCell>
                <TableCell>{r.rows_affected}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.rationale}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AuditReferenceMasters() {
  return (
    <PageShell
      title="Audit Reference Masters"
      subtitle="Governed canonical values for Audit Type, Coverage Category and Follow-Up Type"
    >
      <Tabs defaultValue="AUDIT_TYPE">
        <TabsList>
          {TYPES.map(t => <TabsTrigger key={t.code} value={t.code}>{t.label}</TabsTrigger>)}
          <TabsTrigger value="RECON">Historical reconciliation</TabsTrigger>
        </TabsList>
        {TYPES.map(t => (
          <TabsContent key={t.code} value={t.code} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.note}</p>
            <ReferenceTypePanel type={t.code} />
          </TabsContent>
        ))}
        <TabsContent value="RECON"><ReconciliationPanel /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
