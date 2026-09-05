import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Clock, User, FileText, CheckCircle2 } from 'lucide-react';
import { formatDateForDisplay } from '@/lib/format-config';

interface AuditReportVersionTimelineProps {
  reportId?: string | null;
}

export function AuditReportVersionTimeline({ reportId }: AuditReportVersionTimelineProps) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['ia_report_versions', reportId],
    queryFn: async () => {
      if (!reportId) return [];
      const { data, error } = await supabase
        .from('ia_report_versions')
        .select('id, version_number, version_label, status, change_summary, created_by, created_at, issued_at, issued_by')
        .eq('report_id', reportId)
        .order('version_number', { ascending: true });
      if (error) return [];
      return data ?? [];
    },
    enabled: !!reportId,
  });

  if (isLoading) {
    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Version History</p>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Version History</p>
        <Badge variant="outline" className="text-[9px] h-4">{versions.length}</Badge>
      </div>
      {versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No versions yet. Create a version to lock the current content — a version is required before the report can be issued.
        </p>
      ) : (
        <div className="space-y-0">
          {versions.map((v: any, i: number) => {
            const Icon = v.issued_at ? CheckCircle2 : FileText;
            return (
              <div key={v.id} className="flex gap-3 pb-4 relative">
                {i < versions.length - 1 && (
                  <div className="absolute left-[11px] top-6 w-px h-full bg-border" />
                )}
                <div className="shrink-0 mt-0.5">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-3 w-3 text-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">
                    v{v.version_number}{v.version_label ? ` · ${v.version_label}` : ''} — {v.status || 'Draft'}
                  </p>
                  {v.change_summary && (
                    <p className="text-[10px] text-muted-foreground truncate">{v.change_summary}</p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <User className="h-2.5 w-2.5" /> {v.issued_by || v.created_by || 'System'}
                    <Clock className="h-2.5 w-2.5 ml-1" /> {formatDateForDisplay(v.issued_at || v.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
