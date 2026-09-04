/**
 * INTERNAL AUDIT — one Distribution History view.
 *
 * Proves WHO received WHAT (exact document + version + fingerprint), WHEN, via
 * WHICH channel, and WITH WHAT delivery result. Read-only, governed by
 * `ia_document_distribution_history`.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Loader2, Paperclip, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDateForDisplay } from '@/lib/format-config';

export interface DistributionHistoryRow {
  request_id: string;
  event_code: string;
  requested_at: string;
  request_status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  channel: string | null;
  message_status: string | null;
  queued_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  document_file_name: string | null;
  document_checksum: string | null;
  document_byte_size: number | null;
  attachment_required: boolean | null;
  attachment_outcome: string | null;
  attachment_outcome_reason: string | null;
}

export function useDistributionHistory(entityId?: string | null) {
  return useQuery({
    queryKey: ['ia-distribution-history', entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<DistributionHistoryRow[]> => {
      const { data, error } = await supabase.rpc('ia_document_distribution_history', {
        p_entity_id: String(entityId),
      } as never);
      if (error) throw error;
      return (data ?? []) as DistributionHistoryRow[];
    },
  });
}

function statusTone(status?: string | null): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'delivered' || s === 'sent' || s === 'completed') return 'bg-green-100 text-green-800 border-green-300';
  if (s === 'failed' || s === 'blocked') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-amber-100 text-amber-800 border-amber-300';
}

export function DistributionHistoryPanel({ entityId }: { entityId?: string | null }) {
  const { data = [], isLoading } = useDistributionHistory(entityId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> Distribution History
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Who received which document version, on which channel, and the delivery result.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading distribution history…
          </div>
        ) : data.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing has been distributed for this record yet.
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((row, idx) => (
              <div key={`${row.request_id}-${row.channel}-${idx}`} className="rounded-md border p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{row.recipient_name || row.recipient_email || 'Recipient'}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] capitalize">{row.channel || '—'}</Badge>
                    <Badge className={`text-[10px] ${statusTone(row.message_status || row.request_status)}`}>
                      {row.message_status || row.request_status}
                    </Badge>
                  </div>
                </div>
                <div className="text-muted-foreground">
                  {row.recipient_email || 'No email destination'} · {formatDateForDisplay(row.requested_at)}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {row.document_file_name ? (
                    <>
                      {row.channel === 'email' ? (
                        <span className="flex items-center gap-1 text-green-700">
                          <Paperclip className="h-3 w-3" /> Document enclosed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-700">
                          <Link2 className="h-3 w-3" /> Secure document link
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {row.document_file_name}
                        {row.document_byte_size ? ` · ${(row.document_byte_size / 1024).toFixed(1)} KB` : ''}
                      </span>
                      {row.document_checksum && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          #{row.document_checksum.slice(0, 12)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No formal document required</span>
                  )}
                  {row.attachment_outcome && (
                    <Badge variant="outline" className="text-[10px] capitalize">{row.attachment_outcome}</Badge>
                  )}
                  {row.attachment_outcome_reason && (
                    <span className="text-muted-foreground">({row.attachment_outcome_reason})</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">Event: {row.event_code}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
