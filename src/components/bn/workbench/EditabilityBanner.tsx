import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock, ShieldAlert, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APPLICATION_CHANNEL_LABEL } from '@/types/bn/amendment';
import type { ClaimEditability } from '@/types/bn/amendment';

interface Props {
  editability: ClaimEditability | null | undefined;
  isLoading?: boolean;
  onRequestCorrection?: () => void;
  onViewHistory?: () => void;
}

/**
 * Top-of-workbench banner showing channel, status, what's editable,
 * what's locked and why — per the per-product amendment policy.
 */
export function EditabilityBanner({ editability, isLoading, onRequestCorrection, onViewHistory }: Props) {
  if (isLoading || !editability) return null;
  const { channel, status, areas, lockedReasons, canRequestCorrection } = editability;

  const channelMessage: Record<string, string> = {
    PUBLIC_ONLINE: 'Public online claim — applicant-submitted fields are locked. Use Request Correction.',
    STAFF_OFFLINE: 'Staff offline claim — application fields are editable until Decision.',
    ASSISTED_COUNTER: 'Assisted counter claim — fields are editable during intake/review.',
    BACK_OFFICE_ENTRY: 'Back office claim — fields editable until lock stage; supervisor approval required after lock.',
    MIGRATED_LEGACY: 'Migrated/legacy claim — supervisor-only corrections, mandatory reason and audit.',
  };

  const editableAreas = Object.entries(areas).filter(([, v]) => v.editable).map(([k]) => k);
  const lockedAreas = Object.entries(areas).filter(([, v]) => !v.editable).map(([k]) => k);
  const anyEditable = editableAreas.length > 0;

  const Icon = anyEditable ? Unlock : Lock;

  return (
    <Alert className="border-l-4" style={{ borderLeftColor: anyEditable ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span>Amendment Policy</span>
        <Badge variant="outline">Channel: {APPLICATION_CHANNEL_LABEL[channel]}</Badge>
        <Badge variant="secondary">Status: {status}</Badge>
      </AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        {/* AMND-02 — the channel sentence describes what the channel would
            allow, not what the computed policy actually allows. Whenever
            anything is locked, the computed reason is the truth and is what
            the officer needs to see. */}
        <p className="text-sm">
          {lockedAreas.length > 0
            ? (lockedReasons[0] ?? `Locked: ${lockedAreas.join(', ')}.`)
            : (channelMessage[channel] ?? channelMessage.STAFF_OFFLINE)}
        </p>


        <div className="flex flex-wrap gap-2 text-xs">
          {editableAreas.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-primary">
              <Unlock className="h-3 w-3" /> Editable: {editableAreas.join(', ')}
            </span>
          )}
          {lockedAreas.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-destructive">
              <Lock className="h-3 w-3" /> Locked: {lockedAreas.join(', ')}
            </span>
          )}
        </div>

        {lockedReasons.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer inline-flex items-center gap-1">
              <Info className="h-3 w-3" /> Why locked?
            </summary>
            <ul className="mt-1 ml-4 list-disc">
              {lockedReasons.map((r, i) => (<li key={i}>{r}</li>))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {canRequestCorrection && (
            <Button size="sm" variant="outline" onClick={onRequestCorrection}>
              <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Request Correction
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onViewHistory}>View Amendment History</Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
