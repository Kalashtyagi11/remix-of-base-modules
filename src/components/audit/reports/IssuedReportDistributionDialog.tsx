/**
 * INTERNAL AUDIT — Official distribution of the issued final report.
 *
 * The screen shows the sealed document (version, checksum, size), the channel
 * carriage policy, and the recipients. It never uploads bytes itself and never
 * chooses a sender, subject, template, provider or channel: it calls the
 * governed report distribution service, which raises one Omni-Comms
 * obligation per recipient.
 */
import React from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Send, ShieldCheck, Trash2, FileLock2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  distributeIssuedAuditReport,
  getSealedReportArtifact,
  type ReportDistributionResult,
  type ReportRecipientInput,
} from '@/services/audit/reportDistributionCommunicationService';
import { OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY } from '@/platform/omni-comms/attachments/attachmentPolicyMatrix';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportNumber?: string | null;
  reportTitle?: string | null;
  engagementTitle?: string | null;
  overallOpinion?: string | null;
  issuedOn?: string | null;
  /** Produces the exact issued PDF bytes the first time the report is sealed. */
  buildPdf: () => Promise<{ blob: Blob; fileName: string } | null>;
  defaultRecipients?: ReportRecipientInput[];
}

const BLOCKER_LABEL: Record<string, string> = {
  artifact_bytes_unavailable: 'The report document could not be produced.',
  artifact_upload_failed: 'The report document could not be stored securely.',
  artifact_registration_failed: 'The report document could not be registered.',
  attachment_registration_failed: 'The document could not be attached for distribution.',
  organization_unresolved: 'The organisation for this audit could not be resolved.',
  attachment_required_unsupported: 'A channel could not carry the required document.',
  attachment_not_available: 'The registered document is no longer available.',
  recipient_email_missing: 'This recipient has no email address on file.',
};

export function IssuedReportDistributionDialog(props: Props) {
  const { open, onOpenChange } = props;
  const [recipients, setRecipients] = React.useState<ReportRecipientInput[]>(
    props.defaultRecipients?.length ? props.defaultRecipients : [{ name: '', email: '' }],
  );
  const [sealed, setSealed] = React.useState<Record<string, any> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReportDistributionResult | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    getSealedReportArtifact(props.reportId).then(setSealed).catch(() => setSealed(null));
  }, [open, props.reportId]);

  const valid = recipients.filter((r) => (r.email || '').includes('@'));

  const handleDistribute = async () => {
    if (valid.length === 0) {
      toast.error('Add at least one recipient email address.');
      return;
    }
    setBusy(true);
    try {
      let blob: Blob | null = null;
      let fileName: string | null = null;
      if (!sealed) {
        const pdf = await props.buildPdf();
        blob = pdf?.blob ?? null;
        fileName = pdf?.fileName ?? null;
      }
      const res = await distributeIssuedAuditReport({
        reportId: props.reportId,
        reportNumber: props.reportNumber,
        reportTitle: props.reportTitle,
        engagementTitle: props.engagementTitle,
        overallOpinion: props.overallOpinion,
        issuedOn: props.issuedOn,
        recipients: valid,
        blob,
        fileName,
      });
      setResult(res);
      setSealed(await getSealedReportArtifact(props.reportId));
      if (res.acceptedCount > 0) {
        toast.success(`Report distributed to ${res.acceptedCount} recipient(s).`);
      } else {
        toast.error('Distribution was blocked. See the outcome details.');
      }
    } finally {
      setBusy(false);
    }
  };

  const artifact = result?.artifact ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileLock2 className="h-5 w-5" /> Distribute Official Audit Report
          </DialogTitle>
          <DialogDescription>
            The exact issued report document is sealed once and sent unchanged to every recipient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {props.reportNumber || 'Final audit report'}
            </div>
            {sealed ? (
              <div className="text-muted-foreground space-y-0.5">
                <div>Document version {sealed.version_number} · sealed {new Date(sealed.issued_at || sealed.created_at).toLocaleString()}</div>
                <div className="font-mono text-[11px] break-all">SHA-256 {sealed.checksum_sha256}</div>
                <div>{Math.round(Number(sealed.byte_size) / 1024)} KB · {sealed.file_name}</div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                No sealed document yet — the issued report will be sealed on first distribution.
              </p>
            )}
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              Email carries the sealed document itself
              (max {OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY.email.maxAttachments} files,{' '}
              {Math.round(OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY.email.maxTotalBytes / (1024 * 1024))} MB).
              In-app and message channels deliver a secure link to the same sealed document instead,
              so a notification is never blocked by a document it cannot physically carry.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Recipients</p>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Name"
                  value={r.name ?? ''}
                  onChange={(e) => setRecipients((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <Input
                  placeholder="name@example.com"
                  value={r.email ?? ''}
                  onChange={(e) => setRecipients((prev) => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                />
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setRecipients((prev) => prev.filter((_, j) => j !== i))}
                  disabled={recipients.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRecipients((p) => [...p, { name: '', email: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Add recipient
            </Button>
          </div>

          {result && (
            <div className="space-y-2">
              <Separator />
              <p className="text-sm font-medium">Distribution outcome</p>
              {artifact && !artifact.ok && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    {BLOCKER_LABEL[artifact.code ?? ''] ?? 'The document could not be prepared for distribution.'}
                  </AlertDescription>
                </Alert>
              )}
              {result.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{r.recipient.name || r.recipient.email}</span>
                  <div className="flex items-center gap-2">
                    {r.blockers.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {BLOCKER_LABEL[r.blockers[0]] ?? r.blockers[0]}
                      </span>
                    )}
                    <Badge variant={r.outcome === 'queued' || r.outcome === 'sent' ? 'default' : 'destructive'}>
                      {r.outcome}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleDistribute} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Distribute report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
