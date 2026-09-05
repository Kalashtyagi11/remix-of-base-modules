import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ClipboardList, Lock, CheckCircle2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  auditId: string;
}

/**
 * Engagement-bound audit programme.
 *
 * A master programme (ia_audit_programs) is bound to this engagement as a
 * frozen snapshot (ia_engagement_programmes / _steps). Approving the snapshot
 * locks its planning content and materialises the matching control tests, so
 * auditors never re-type approved programme content.
 */
export function EngagementProgrammePanel({ auditId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedProgramme, setSelectedProgramme] = useState('');
  const [tailoring, setTailoring] = useState('');

  const { data: bound, isLoading } = useQuery({
    queryKey: ['ia_engagement_programme', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_engagement_programmes')
        .select('*')
        .eq('engagement_id', auditId)
        .neq('status', 'Superseded')
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ['ia_engagement_programme_steps', bound?.id],
    enabled: !!bound?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_engagement_programme_steps')
        .select('*')
        .eq('engagement_programme_id', bound.id)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: masters = [] } = useQuery({
    queryKey: ['ia_audit_programs', 'approved'],
    enabled: !bound,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_audit_programs')
        .select('id, program_name, program_code, status, version')
        .in('status', ['Approved', 'Published'])
        .order('program_name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ia_engagement_programme', auditId] });
    qc.invalidateQueries({ queryKey: ['ia_engagement_programme_steps'] });
    qc.invalidateQueries({ queryKey: ['eng_control_tests'] });
  };

  const bindMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('ia_bind_programme_to_engagement', {
        p_engagement_id: auditId,
        p_program_id: selectedProgramme,
        p_tailoring_notes: tailoring || null,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Unable to bind programme');
      return data;
    },
    onSuccess: (d: any) => { toast({ title: 'Programme bound', description: `${d?.steps ?? 0} step(s) copied to this audit.` }); setTailoring(''); refresh(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('ia_approve_engagement_programme', {
        p_engagement_programme_id: bound.id,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Unable to approve programme');
      return data;
    },
    onSuccess: (d: any) => { toast({ title: 'Programme approved', description: `${d?.control_tests_created ?? 0} control test(s) created.` }); refresh(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (!bound) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Audit programme</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Bind an approved master programme to this audit. A frozen copy is taken, so later edits to the
            master never change this audit.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Approved programme</Label>
              <Select value={selectedProgramme} onValueChange={setSelectedProgramme}>
                <SelectTrigger><SelectValue placeholder="Select a programme" /></SelectTrigger>
                <SelectContent>
                  {masters.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.program_name}{m.version ? ` (v${m.version})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {masters.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">No approved programmes available yet.</p>
              )}
            </div>
            <div>
              <Label>Tailoring notes</Label>
              <Textarea rows={2} value={tailoring} onChange={(e) => setTailoring(e.target.value)}
                placeholder="Why this programme was tailored for this audit" />
            </div>
          </div>
          <Button size="sm" disabled={!selectedProgramme || bindMutation.isPending} onClick={() => bindMutation.mutate()}>
            {bindMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Bind programme
          </Button>
        </CardContent>
      </Card>
    );
  }

  const approved = bound.status === 'Approved';

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">{bound.programme_name}</p>
              <Badge variant={approved ? 'default' : 'secondary'}>{bound.status}</Badge>
              {approved && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {steps.length} step(s){bound.tailoring_notes ? ` — ${bound.tailoring_notes}` : ''}
            </p>
          </div>
          {!approved && (
            <Button size="sm" disabled={approveMutation.isPending || steps.length === 0} onClick={() => approveMutation.mutate()}>
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Approve programme
            </Button>
          )}
        </div>

        <div className="divide-y rounded-md border">
          {steps.map((s: any) => (
            <div key={s.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-2">{s.step_no}</span>{s.title}
                </p>
                {s.procedure_text && <p className="mt-0.5 text-xs text-muted-foreground">{s.procedure_text}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.planned_sample_size ? <span className="text-xs text-muted-foreground">n={s.planned_sample_size}</span> : null}
                {s.control_test_id && <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-label="Control test created" />}
                <Badge variant="outline">{s.execution_status}</Badge>
              </div>
            </div>
          ))}
          {steps.length === 0 && <p className="p-3 text-xs text-muted-foreground">No steps in this programme.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
