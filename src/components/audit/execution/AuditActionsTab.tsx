import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CheckCircle, Lock, Clock, AlertTriangle, Paperclip } from 'lucide-react';
import { StatusBadge, DataTable } from '@/components/common';
import type { DataTableColumn } from '@/components/common';
import { useIAActionTrackingMutations } from '@/hooks/useAuditData';
import { AuditEmptyState } from '@/components/audit/workspace/AuditEmptyState';
import { AuditReadinessPanel } from '@/components/audit/workspace/AuditReadinessPanel';
import { formatDateForDisplay } from '@/lib/format-config';
import { useUserCode } from '@/hooks/useUserCode';
import { useToast } from '@/hooks/use-toast';
import { ACTION_STATES } from '@/config/auditWorkflowVocabulary';
import { notifyActionAssigned } from '@/services/auditNotificationService';
import { useInternalAuditPermissions } from '@/hooks/useInternalAuditPermissions';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RecommendationActionCards } from '@/components/audit/execution/RecommendationActionCards';
import { useLinkActionEvidence } from '@/hooks/useAuditPhase3';

interface AuditActionsTabProps {
  auditId: string;
  audit: any;
  auditFindings: any[];
  auditActions: any[];
  auditResponses: any[];
  auditEvidence?: any[];
  onClose: () => void;
}

// Stage 2E (DEF-E2E-012): canonical governed corrective-action vocabulary.
const ACTION_STATUSES = [...ACTION_STATES];

export function AuditActionsTab({ auditId, audit, auditFindings, auditActions, auditResponses, auditEvidence = [], onClose }: AuditActionsTabProps) {
  const { create, update } = useIAActionTrackingMutations();
  const queryClient = useQueryClient();
  const { userCode } = useUserCode();
  const { toast } = useToast();
  const { can } = useInternalAuditPermissions();
  const linkEvidence = useLinkActionEvidence();
  const canProgress = can('progress_audit_actions');
  const canCloseActions = can('close_audit_actions');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ finding_id: '', action_description: '', responsible_person: '', target_date: '' });
  const [closureNotes, setClosureNotes] = useState(audit?.closure_notes || '');
  const [progressAction, setProgressAction] = useState<any>(null);
  const [progressForm, setProgressForm] = useState({ status: 'Open', target_date: '', responsible_person: '', notes: '' });
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [savingProgress, setSavingProgress] = useState(false);


  const isOverdue = (action: any) => {
    if (!action.target_date) return false;
    if (['Completed', 'Closed'].includes(action.status || '')) return false;
    return new Date(action.target_date) < new Date();
  };

  const overdueCount = auditActions.filter(isOverdue).length;
  const openFindingsCount = auditFindings.filter((f: any) => !['Closed', 'Resolved'].includes(f.status || '')).length;
  // IA-FULL-E2E-015: an engagement closed as "Closed – Actions Pending" must keep
  // its outstanding corrective actions workable; only a full closure/cancellation locks them.
  const closureState = String(audit?.execution_status || audit?.status || '');
  const isClosureRecorded = closureState.startsWith('Closed') || closureState === 'Cancelled';
  const isClosed = closureState === 'Closed' || closureState === 'Cancelled';
  const canCreateActions = can('create_audit_actions');


  const openProgress = (row: any) => {
    setProgressAction(row);
    setProgressForm({
      status: row.status || 'Open',
      target_date: row.target_date || '',
      responsible_person: row.responsible_person || '',
      notes: row.notes || '',
    });
    setEvidenceIds(Array.isArray(row.evidence_ids) ? row.evidence_ids : []);
  };

  const toggleEvidence = (id: string) =>
    setEvidenceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleProgressSave = async () => {
    if (!progressAction) return;
    const closing = ['Verified', 'Closed', 'Cancelled'].includes(progressForm.status);
    if (closing && !canCloseActions) {
      toast({ title: 'Not permitted', description: 'Only the audit team may verify, close or cancel a corrective action.', variant: 'destructive' });
      return;
    }
    if (closing && !progressForm.notes.trim()) {
      toast({ title: 'Validation', description: 'Closure evidence notes are required before verifying or closing an action.', variant: 'destructive' });
      return;
    }
    const originalEvidence: string[] = Array.isArray(progressAction.evidence_ids) ? progressAction.evidence_ids : [];
    const evidenceChanged =
      originalEvidence.length !== evidenceIds.length ||
      originalEvidence.some((id) => !evidenceIds.includes(id));

    setSavingProgress(true);
    try {
      // Governed command: the responsible manager may progress the action,
      // while verification/closure/cancellation stays with the audit team.
      const { data, error } = await (supabase.rpc as any)('ia_progress_corrective_action', {
        p_action_id: progressAction.id,
        p_status: progressForm.status,
        p_notes: progressForm.notes || null,
        p_target_date: progressForm.target_date || null,
        p_responsible_person: progressForm.responsible_person || null,
      });
      if (error) throw error;
      if (data && data.success === false) {
        toast({ title: 'Action blocked', description: data.error || 'Update rejected', variant: 'destructive' });
        return;
      }
      if (evidenceChanged) {
        await new Promise<void>((resolve) =>
          linkEvidence.mutate({ actionId: progressAction.id, evidenceIds }, { onSettled: () => resolve() }),
        );
      }
      toast({ title: 'Action Updated' });
      setProgressAction(null);
      queryClient.invalidateQueries({ queryKey: ['ia_action_tracking'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Update failed', variant: 'destructive' });
    } finally {
      setSavingProgress(false);
    }
  };



  const handleCreate = () => {
    if (!form.finding_id || !form.action_description) {
      toast({ title: 'Validation', description: 'Finding and action description are required', variant: 'destructive' });
      return;
    }
    create.mutate({
      finding_id: form.finding_id, engagement_id: auditId,
      action_description: form.action_description,
      responsible_person: form.responsible_person || null,
      target_date: form.target_date || null, status: 'Open', created_by: userCode || null,
    } as any, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ finding_id: '', action_description: '', responsible_person: '', target_date: '' });
        if (form.responsible_person) notifyActionAssigned(form.action_description, form.responsible_person, form.target_date);
      },
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: 'finding', header: 'Finding', render: (r) => {
      const finding = auditFindings.find((f: any) => f.id === r.finding_id);
      return <span className="text-sm">{finding?.title || r.finding_id?.slice(0, 8)}</span>;
    }},
    { key: 'action_description', header: 'Action', render: (r) => <span className="text-sm max-w-[200px] truncate block">{r.action_description || '—'}</span> },
    { key: 'responsible_person', header: 'Assigned To', render: (r) => <span className="text-xs">{r.responsible_person || '—'}</span> },
    { key: 'target_date', header: 'Due Date', render: (r) => r.target_date ? formatDateForDisplay(r.target_date) : '—' },
    { key: 'documents', header: 'Documents', render: (r) => {
      const count = Array.isArray(r.evidence_ids) ? r.evidence_ids.length : 0;
      return (
        <span className={`text-xs flex items-center gap-1 ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
          <Paperclip className="h-3.5 w-3.5" />{count}
        </span>
      );
    }},

    { key: 'status', header: 'Status', render: (r) => (
      <div className="flex items-center gap-1">
        <StatusBadge status={r.status || 'Open'} />
        {isOverdue(r) && <StatusBadge status="Overdue" />}
      </div>
    )},
    { key: 'row_actions', header: 'Update', render: (r) => (
      <Button size="sm" variant="outline" disabled={(!canProgress && !canCloseActions) || isClosed} onClick={() => openProgress(r)}>
        Update
      </Button>
    )},
  ];


  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50">
          <CheckCircle className="h-4 w-4 text-primary shrink-0" /><div><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold">{auditActions.length}</p></div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" /><div><p className="text-xs text-muted-foreground">Open</p><p className="text-lg font-bold">{auditActions.filter((a: any) => a.status === 'Open').length}</p></div>
        </div>
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${overdueCount > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border/50'}`}>
          <AlertTriangle className={`h-4 w-4 ${overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'} shrink-0`} /><div><p className="text-xs text-muted-foreground">Overdue</p><p className="text-lg font-bold">{overdueCount}</p></div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" /><div><p className="text-xs text-muted-foreground">Completed</p><p className="text-lg font-bold">{auditActions.filter((a: any) => ['Completed', 'Closed'].includes(a.status || '')).length}</p></div>
        </div>
      </div>

      {/* Recommendations awaiting conversion into actions */}
      <RecommendationActionCards auditId={auditId} auditActions={auditActions} disabled={isClosed} />

      {/* Actions Table */}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{auditActions.length} action(s)</p>
        {canCreateActions && !isClosed && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-1" />New Action</Button>
        )}
      </div>

      {showForm && (
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div><Label>Finding *</Label>
              <Select value={form.finding_id} onValueChange={v => setForm(f => ({ ...f, finding_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select finding" /></SelectTrigger>
                <SelectContent>{auditFindings.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Action Description *</Label><Textarea value={form.action_description} onChange={e => setForm(f => ({ ...f, action_description: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Assigned To</Label><Input value={form.responsible_person} onChange={e => setForm(f => ({ ...f, responsible_person: e.target.value }))} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={create.isPending}>Create Action</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {auditActions.length === 0 && !showForm ? (
        <AuditEmptyState icon={CheckCircle} title="No corrective actions yet" description="Actions will be created from audit findings" actionLabel={canCreateActions && !isClosed ? 'Create Action' : undefined} onAction={canCreateActions && !isClosed ? () => setShowForm(true) : undefined} />
      ) : (
        <Card><CardContent className="pt-4">
          <DataTable columns={columns} data={auditActions} emptyMessage="No corrective actions assigned."
            rowClassName={(row) => isOverdue(row) ? 'bg-destructive/5 border-l-2 border-l-destructive' : ''}
          />
        </CardContent></Card>
      )}

      <Dialog open={!!progressAction} onOpenChange={(open) => !open && setProgressAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Corrective Action</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={progressForm.status} onValueChange={(v) => setProgressForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Assigned To</Label><Input value={progressForm.responsible_person} onChange={(e) => setProgressForm((f) => ({ ...f, responsible_person: e.target.value }))} /></div>
              <div><Label>Revised Due Date</Label><Input type="date" value={progressForm.target_date} onChange={(e) => setProgressForm((f) => ({ ...f, target_date: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Progress / Evidence Notes{['Verified', 'Closed'].includes(progressForm.status) ? ' *' : ''}</Label>
              <Textarea rows={3} value={progressForm.notes} onChange={(e) => setProgressForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />Linked Documents</Label>
              {auditEvidence.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">No documents uploaded for this audit yet.</p>
              ) : (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                  {auditEvidence.map((ev: any) => (
                    <label key={ev.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/40">
                      <Checkbox checked={evidenceIds.includes(ev.id)} onCheckedChange={() => toggleEvidence(ev.id)} />
                      <span className="text-xs truncate">{ev.file_name || ev.description || ev.evidence_id || ev.id.slice(0, 8)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgressAction(null)}>Cancel</Button>
            <Button onClick={handleProgressSave} disabled={savingProgress}>Save Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closure Section */}
      <AuditReadinessPanel
        title="Closure Readiness"
        checks={[
          { label: 'All checklist items assessed', passed: true, required: true },
          { label: `All findings resolved (${openFindingsCount} open)`, passed: openFindingsCount === 0, required: true },
          { label: `Management responses received (${auditResponses.length})`, passed: auditFindings.length === 0 || auditResponses.length >= auditFindings.length, required: true },
          { label: `Actions assigned (${auditActions.length})`, passed: auditFindings.length === 0 || auditActions.length > 0, required: true },
        ]}
      />
      {isClosureRecorded ? (
        <Card className="border-primary/30">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2 text-primary"><Lock className="h-4 w-4" /><span className="font-medium">{closureState}</span></div>
            {audit?.closure_date && <p className="text-sm text-muted-foreground">Closed on: {formatDateForDisplay(audit.closure_date)}</p>}
            {audit?.closed_by && <p className="text-sm text-muted-foreground">Closed by: {audit.closed_by}</p>}
            {audit?.closure_notes && <p className="text-sm mt-2">{audit.closure_notes}</p>}
            {!isClosed && (
              <p className="text-sm text-muted-foreground">
                Outstanding corrective actions remain open and can still be progressed, verified and closed here.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">
              Closure is performed on the Closure tab, where every closure requirement is checked and the disposition is recorded.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
