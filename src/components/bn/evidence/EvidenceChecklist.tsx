import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, CheckCircle2, XCircle, ShieldOff, HelpCircle, AlertTriangle, FileText, Clock, Trash2 } from 'lucide-react';
import {
  useBnClaimEvidence,
  useBnEvidenceChecklist,
  useBnIsEvidenceComplete,
  useMarkChecklistPending,
  useWaiveChecklistItem,
  useDeleteEvidence,

} from '@/hooks/bn/useBnEvidence';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';
import { EvidenceUploadDialog } from './EvidenceUploadDialog';
import { EvidenceActionDialog } from './EvidenceActionDialog';
import { useUserCode } from '@/hooks/useUserCode';
import { toast } from 'sonner';
import type { BnClaimEvidence, BnEvidenceChecklist as ChecklistType } from '@/types/bn';

export type EvidenceMode = 'PUBLIC' | 'INTERNAL';
export type EvidenceStage = 'INTAKE' | 'EVIDENCE_REVIEW' | 'DECISION' | 'POST_AWARD' | 'PERIODIC_REVIEW';

interface Props {
  claimId: string;
  userRoles?: string[];
  /** PUBLIC hides verify/reject/waive/mark-pending. */
  mode?: EvidenceMode;
  /** When true (from Product Catalog channel config) public users can submit with pending docs. */
  allowPendingDocuments?: boolean;
  /** Permission gate for waiver actions in INTERNAL mode. */
  canWaive?: boolean;
  /** Permission gate for mark-pending in INTERNAL mode. */
  canMarkPending?: boolean;
  /** Optional stage filter — limit checklist rows to these stages. */
  stages?: EvidenceStage[];
}

export function EvidenceChecklist({
  claimId,
  userRoles = [],
  mode = 'INTERNAL',
  allowPendingDocuments = false,
  canWaive,
  canMarkPending,
  stages,
}: Props) {
  const { userCode } = useUserCode();
  const { data: evidence = [], isLoading: loadingEvidence } = useBnClaimEvidence(claimId);
  const { data: rawChecklist = [], isLoading: loadingChecklist } = useBnEvidenceChecklist(claimId);
  const { data: isComplete } = useBnIsEvidenceComplete(claimId);

  const checklist = useMemo(() => {
    if (!stages || stages.length === 0) return rawChecklist as ChecklistType[];
    const allowed = new Set(stages);
    return (rawChecklist as any[]).filter(item => allowed.has(item.bn_doc_requirement?.stage));
  }, [rawChecklist, stages]);

  const markPending = useMarkChecklistPending();
  const waiveItem = useWaiveChecklistItem();
  const deleteEvidence = useDeleteEvidence();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadContext, setUploadContext] = useState<{ typeCode?: string; name?: string; requirementId?: string; extensions?: string[]; maxSize?: number }>({});
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<'VERIFY' | 'REJECT' | 'WAIVE' | 'REQUEST_INFO'>('VERIFY');
  const [selectedEvidence, setSelectedEvidence] = useState<BnClaimEvidence | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{ open: boolean; kind: 'PENDING' | 'WAIVE' | 'DELETE'; checklistId: string; docName: string; evidenceId?: string } | null>(null);
  const [reasonText, setReasonText] = useState('');

  const isInternal = mode === 'INTERNAL';
  const roleCanVerify = isInternal && userRoles.some(r => ['Admin', 'SUPERVISOR', 'CLAIMS_OFFICER'].includes(r));
  const roleCanWaive = canWaive ?? (isInternal && userRoles.some(r => ['Admin', 'SUPERVISOR', 'MANAGER'].includes(r)));
  const roleCanMarkPending = canMarkPending ?? (isInternal && userRoles.some(r => ['Admin', 'SUPERVISOR', 'CLAIMS_OFFICER'].includes(r)));

  const blockingCount = checklist.filter((c: ChecklistType) => c.is_blocking).length;

  const openUpload = (ctx?: typeof uploadContext) => {
    setUploadContext(ctx || {});
    setUploadOpen(true);
  };

  const openAction = (type: typeof actionType, ev: BnClaimEvidence) => {
    setActionType(type);
    setSelectedEvidence(ev);
    setActionOpen(true);
  };

  const submitReason = async () => {
    if (!reasonDialog) return;
    if (!reasonText.trim()) { toast.error('A reason is required.'); return; }
    try {
      if (reasonDialog.kind === 'DELETE') {
        await deleteEvidence.mutateAsync({ evidenceId: reasonDialog.evidenceId!, reason: reasonText, userCode: userCode || 'SYSTEM' });
        toast.success(`${reasonDialog.docName} deleted.`);
      } else if (reasonDialog.kind === 'PENDING') {
        await markPending.mutateAsync({ claimId, checklistId: reasonDialog.checklistId, reason: reasonText, userCode: userCode || 'SYSTEM' });
        toast.success(`${reasonDialog.docName} marked pending.`);
      } else {
        await waiveItem.mutateAsync({ claimId, checklistId: reasonDialog.checklistId, reason: reasonText, userCode: userCode || 'SYSTEM' });
        toast.success(`${reasonDialog.docName} waived.`);
      }
      setReasonDialog(null);
      setReasonText('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Action failed.');
    }
  };

  const isLoading = loadingEvidence || loadingChecklist;


  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Evidence & Documents
            </CardTitle>
            <CardDescription>
              {isComplete === true
                ? 'All mandatory documents have been verified'
                : isComplete === false
                  ? `${blockingCount} mandatory document(s) still outstanding`
                  : 'Loading evidence status...'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isComplete === true ? (
              <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Evidence Complete</Badge>
            ) : isComplete === false ? (
              <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {blockingCount} Blocking</Badge>
            ) : null}
            <Button onClick={() => openUpload()} className="gap-2"><Upload className="h-4 w-4" /> Upload Document</Button>
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'PUBLIC' && (
            <Alert className="mb-4">
              <FileText className="h-4 w-4" />
              <AlertTitle>Required documents come from the Product Catalog</AlertTitle>
              <AlertDescription>
                {allowPendingDocuments
                  ? 'You can submit and upload remaining mandatory documents later.'
                  : 'All mandatory documents must be uploaded before you can submit this application.'}
              </AlertDescription>
            </Alert>
          )}
          {isLoading ? (
            <p className="text-muted-foreground py-4">Loading evidence...</p>
          ) : (
            <>
              {/* Checklist Section */}
              {checklist.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Requirements Checklist</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-48">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checklist.map((item: any) => {
                        const req = item.bn_doc_requirement;
                        const isOutstanding = item.status === 'OUTSTANDING';
                        return (
                          <TableRow key={item.id} className={item.is_blocking ? 'bg-destructive/5' : ''}>
                            <TableCell>
                              <div>
                                <span className="font-medium">{req?.document_type_code || 'Unknown'}</span>
                                {req?.description && <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{req?.stage || '-'}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={req?.requirement_level === 'MANDATORY' ? 'destructive' : req?.requirement_level === 'WAIVABLE' ? 'warning' : 'secondary'}>
                                {req?.requirement_level || 'OPTIONAL'}
                              </Badge>
                            </TableCell>
                            <TableCell><EvidenceStatusBadge status={item.status} /></TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {isOutstanding && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openUpload({
                                    typeCode: req?.document_type_code,
                                    name: req?.document_type_code,
                                    requirementId: item.requirement_id,
                                    extensions: req?.allowed_extensions,
                                    maxSize: req?.max_file_size_mb,
                                  })}>
                                    <Upload className="h-3 w-3" /> Upload
                                  </Button>
                                )}
                                {isInternal && isOutstanding && roleCanMarkPending && (
                                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => {
                                    setReasonDialog({ open: true, kind: 'PENDING', checklistId: item.id, docName: req?.document_type_code ?? 'Document' });
                                    setReasonText('');
                                  }}>
                                    <Clock className="h-3 w-3" /> Pending
                                  </Button>
                                )}
                                {isInternal && isOutstanding && roleCanWaive && req?.requirement_level !== 'MANDATORY' && (
                                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => {
                                    setReasonDialog({ open: true, kind: 'WAIVE', checklistId: item.id, docName: req?.document_type_code ?? 'Document' });
                                    setReasonText('');
                                  }}>
                                    <ShieldOff className="h-3 w-3" /> Waive
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}


              {/* All Evidence */}
              <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">All Evidence ({evidence.length})</h4>
              {evidence.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">No evidence documents uploaded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-36">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evidence.map((ev: BnClaimEvidence) => (
                      <TableRow key={ev.id} className={ev.status === 'EXPIRED' ? 'bg-warning/5' : ''}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{ev.document_name}</span>
                            {ev.file_name && <p className="text-xs text-muted-foreground">{ev.file_name}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{ev.document_type_code}</TableCell>
                        <TableCell><Badge variant="outline">{ev.source}</Badge></TableCell>
                        <TableCell><EvidenceStatusBadge status={ev.status} /></TableCell>
                        <TableCell className="text-sm">{ev.expires_at || '—'}</TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <div className="flex gap-1">
                              {isInternal && ev.status === 'RECEIVED' && roleCanVerify && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" onClick={() => openAction('VERIFY', ev)}>
                                      <CheckCircle2 className="h-4 w-4 text-primary" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Verify</TooltipContent>
                                </Tooltip>
                              )}
                              {isInternal && ev.status === 'RECEIVED' && roleCanVerify && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" onClick={() => openAction('REJECT', ev)}>
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject</TooltipContent>
                                </Tooltip>
                              )}
                              {isInternal && (ev.status === 'RECEIVED' || ev.status === 'REJECTED') && roleCanWaive && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" onClick={() => openAction('WAIVE', ev)}>
                                      <ShieldOff className="h-4 w-4 text-warning" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Waive</TooltipContent>
                                </Tooltip>
                              )}
                              {isInternal && ev.status !== 'VERIFIED' && ev.status !== 'WAIVED' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" onClick={() => openAction('REQUEST_INFO', ev)}>
                                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Request More Info</TooltipContent>
                                </Tooltip>
                              )}
                              {isInternal && ev.status !== 'VERIFIED' && ev.status !== 'WAIVED' && roleCanVerify && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={deleteEvidence.isPending}
                                      onClick={() => {
                                        setReasonDialog({ open: true, kind: 'DELETE', checklistId: '', docName: ev.document_name, evidenceId: ev.id });
                                        setReasonText('');
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete document</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>

                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <EvidenceUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        claimId={claimId}
        preselectedTypeCode={uploadContext.typeCode}
        preselectedName={uploadContext.name}
        requirementId={uploadContext.requirementId}
        allowedExtensions={uploadContext.extensions}
        maxFileSizeMb={uploadContext.maxSize}
      />

      {selectedEvidence && (
        <EvidenceActionDialog
          open={actionOpen}
          onOpenChange={setActionOpen}
          action={actionType}
          evidenceId={selectedEvidence.id}
          documentName={selectedEvidence.document_name}
        />
      )}

      <Dialog open={!!reasonDialog} onOpenChange={(o) => { if (!o) { setReasonDialog(null); setReasonText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonDialog?.kind === 'PENDING' ? 'Mark Document Pending' : reasonDialog?.kind === 'DELETE' ? 'Delete Document' : 'Waive Document Requirement'}</DialogTitle>
            <DialogDescription>
              {reasonDialog?.docName} — a reason is required and will be recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReasonDialog(null); setReasonText(''); }}>Cancel</Button>
            <Button onClick={submitReason} disabled={!reasonText.trim() || markPending.isPending || waiveItem.isPending || deleteEvidence.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

}
