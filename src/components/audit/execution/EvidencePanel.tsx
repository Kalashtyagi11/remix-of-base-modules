import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Paperclip, Plus, X, AlertTriangle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useUserCode } from '@/hooks/useUserCode';
import { AUDIT_ACCEPT_ATTRIBUTE } from '@/lib/audit/auditAttachmentUpload';
import {
  createAuditEvidence,
  fetchLinkedEvidence,
  openAuditEvidence,
  unlinkEvidence,
  type EvidenceLinkRequest,
  type EvidenceLinkedType,
} from '@/lib/audit/auditEvidenceService';

interface Props {
  engagementId: string;
  /** Primary object this panel manages evidence for. */
  linkedType: EvidenceLinkedType;
  linkedId: string;
  /** Extra context inherited automatically on upload (test, programme step…). */
  inheritedLinks?: EvidenceLinkRequest[];
  title?: string;
  /** Read-only when the underlying work is concluded/issued. */
  readOnly?: boolean;
  compact?: boolean;
}

/**
 * Canonical Internal Audit evidence panel used at the POINT OF WORK.
 * One evidence record, one physical file, many governed relationships.
 * Engagement / test / sample context is inherited — never re-keyed.
 */
export function EvidencePanel({
  engagementId,
  linkedType,
  linkedId,
  inheritedLinks = [],
  title = 'Evidence',
  readOnly = false,
  compact = false,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { userCode } = useUserCode();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', source: '', evidence_date: '' });
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<Record<string, boolean>>({});

  const queryKey = ['ia_evidence_links', linkedType, linkedId];
  const { data: evidence = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchLinkedEvidence(linkedType, linkedId),
    enabled: !!linkedId,
  });

  const add = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Select a file to attach');
      return createAuditEvidence({
        engagementId,
        file,
        description: form.description,
        source: form.source || null,
        evidenceDate: form.evidence_date ? new Date(form.evidence_date).toISOString() : null,
        uploadedBy: userCode || null,
        links: [{ linked_type: linkedType, linked_id: linkedId, link_role: 'Primary' }, ...inheritedLinks],
      });
    },
    onSuccess: (res) => {
      toast({ title: 'Evidence added', description: `${res.evidence_id} stored securely (SHA-256 recorded).` });
      setForm({ description: '', source: '', evidence_date: '' });
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['eng_evidence'] });
      qc.invalidateQueries({ queryKey: ['ia_evidence'] });
    },
    onError: (e: any) => toast({ title: 'Evidence not saved', description: e.message, variant: 'destructive' }),
  });

  const detach = useMutation({
    mutationFn: (linkId: string) => unlinkEvidence(linkId),
    onSuccess: () => {
      toast({ title: 'Evidence reference removed', description: 'The evidence record itself was kept.' });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast({ title: 'Cannot remove reference', description: e.message, variant: 'destructive' }),
  });

  const view = async (row: any) => {
    setBusy(true);
    const state = await openAuditEvidence(row);
    setBusy(false);
    if (!state.ok) {
      setMissing(m => ({ ...m, [row.id]: state.missingFile }));
      toast({
        title: state.missingFile ? 'File unavailable' : 'No file attached',
        description: state.reason,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          {title}{evidence.length ? ` (${evidence.length})` : ''}
        </p>
        {!readOnly && !showForm && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add evidence
          </Button>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : evidence.length === 0 ? (
        <p className="text-xs text-muted-foreground">No evidence attached yet.</p>
      ) : (
        <ul className="space-y-1">
          {evidence.map((ev: any) => (
            <li key={ev.link_id} className="flex items-start gap-2 rounded-md border p-2">
              <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{ev.file_name || ev.evidence_id}</p>
                {ev.description && <p className="text-[11px] text-muted-foreground">{ev.description}</p>}
                <p className="text-[10px] text-muted-foreground font-mono">
                  {ev.evidence_id}
                  {ev.link_role ? ` · ${ev.link_role}` : ''}
                  {ev.hash ? ` · SHA-256 ${String(ev.hash).slice(0, 12)}…` : ' · no integrity value'}
                </p>
                {missing[ev.id] && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3" />Record exists but the stored file is unavailable
                  </p>
                )}
                {ev.withdrawn_at && <Badge variant="secondary" className="mt-1 text-[10px]">Withdrawn</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="link" className="h-auto p-0 text-xs" disabled={busy} onClick={() => view(ev)}>
                  View
                </Button>
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    title="Remove this reference (the evidence record is kept)"
                    onClick={() => detach.mutate(ev.link_id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && !readOnly && (
        <div className="space-y-2 rounded-md border border-primary/30 p-3">
          <div>
            <Label className="text-xs">What does this evidence support? *</Label>
            <Textarea
              rows={2}
              className="text-sm"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Approval and eligibility documents for sampled invalidity award PAY-98271"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Source (optional)</Label>
              <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Benefits Department" />
            </div>
            <div>
              <Label className="text-xs">Evidence date (optional)</Label>
              <Input type="date" value={form.evidence_date} onChange={e => setForm(f => ({ ...f, evidence_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">File *</Label>
            <Input ref={fileRef} type="file" accept={AUDIT_ACCEPT_ATTRIBUTE} className="text-xs" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Audit, test and sample context, uploader, timestamp, type, size and the SHA-256 integrity value are captured automatically.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save evidence
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
