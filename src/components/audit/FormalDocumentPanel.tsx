/**
 * INTERNAL AUDIT — Formal Document panel for governed distribution.
 *
 * One presentation of the official system document across every Internal Audit
 * distribution surface. The panel never decides policy: it renders whatever the
 * central policy (`resolveAuditCommunicationArtifacts`) resolved.
 */
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText, ShieldCheck, AlertTriangle, Loader2, Eye, FilePlus2, Lock,
} from 'lucide-react';
import type { ResolvedCommunicationDocument } from '@/services/audit/auditCommunicationDocumentPolicy';

export interface FormalDocumentPanelProps {
  resolved: ResolvedCommunicationDocument | null;
  isResolving: boolean;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onView?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FormalDocumentPanel({
  resolved, isResolving, isGenerating, onGenerate, onView,
}: FormalDocumentPanelProps) {
  if (isResolving) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the formal document for this communication…
        </CardContent>
      </Card>
    );
  }

  if (!resolved || !resolved.policy || resolved.requirement === 'NONE') {
    return (
      <Card className="border-muted">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          No formal document is required for this communication. Recipients receive a secure in-platform link where relevant.
        </CardContent>
      </Card>
    );
  }

  const { policy, requirement, artifact, correctiveAction, requirementSource } = resolved;
  const required = requirement === 'REQUIRED';

  return (
    <Card className={artifact ? 'border-primary/30 bg-primary/5' : required ? 'border-destructive/40 bg-destructive/5' : 'border-amber-300 bg-amber-50/50'}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Formal Document
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={required ? 'default' : 'outline'} className="text-[10px]">
              {required ? 'Required' : 'Optional'}
            </Badge>
            {requirementSource === 'configuration' && (
              <Badge variant="outline" className="text-[10px]">Organisation policy</Badge>
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">{policy.documentLabel}</div>

        {artifact ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div><span className="text-muted-foreground">Document: </span><span className="font-medium">{artifact.fileName}</span></div>
              <div><span className="text-muted-foreground">Reference: </span><span className="font-medium">{artifact.documentNumber || '—'}</span></div>
              <div><span className="text-muted-foreground">Version: </span><span className="font-medium">v{artifact.versionNumber}</span></div>
              <div><span className="text-muted-foreground">Lifecycle: </span><span className="font-medium">{artifact.status}</span></div>
              <div><span className="text-muted-foreground">Size: </span><span className="font-medium">{formatBytes(artifact.byteSize)}</span></div>
              <div><span className="text-muted-foreground">Classification: </span><span className="font-medium capitalize">{artifact.classification}</span></div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onView}>
                <Eye className="h-3 w-3 mr-1" /> View PDF
              </Button>
              {required && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Automatically enclosed — cannot be removed
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-green-700 ml-auto">
                <ShieldCheck className="h-3 w-3" /> Sealed bytes reused
              </span>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {required
                  ? 'The formal document for this communication does not exist yet. Distribution is blocked until it is produced.'
                  : 'No formal document has been produced for this communication.'}
              </span>
            </div>
            {correctiveAction === 'generate_document' ? (
              <Button type="button" size="sm" className="h-7 text-[11px]" onClick={onGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FilePlus2 className="h-3 w-3 mr-1" />}
                Generate Document
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Complete the required stage first: {policy.upstreamStageLabel}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
