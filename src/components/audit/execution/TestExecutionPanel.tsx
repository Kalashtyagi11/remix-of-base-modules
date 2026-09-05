import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserCode } from '@/hooks/useUserCode';

const ITEM_RESULTS = ['Pass', 'Exception', 'Not Applicable'];
const SEVERITIES = ['Low', 'Medium', 'High'];
const DISPOSITIONS = [
  'Finding Raised',
  'No Finding - Isolated',
  'No Finding - Compensating Control',
  'Not an Exception',
  'More Testing Required',
  'Corrected During Fieldwork',
];

const RATIONALE_LABEL: Record<string, string> = {
  'No Finding - Isolated': 'Why this is isolated and no finding is raised *',
  'No Finding - Compensating Control': 'Compensating / alternate control relied on *',
  'Not an Exception': 'Why this is not an exception *',
  'More Testing Required': 'What further testing is required *',
  'Corrected During Fieldwork': 'What was corrected, by whom, and supporting evidence *',
};

interface Props {
  auditId: string;
  test: any;
  departmentId?: string;
  onClose: () => void;
}

/**
 * Sample-item execution and exception evaluation for a single control test.
 *
 * Sample size and exception counts on the control test are derived from the
 * items recorded here. Exceptions never auto-create findings — an auditor must
 * evaluate each one, and unevaluated exceptions block test conclusion.
 */
export function TestExecutionPanel({ auditId, test, departmentId, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { userCode } = useUserCode();
  const { create: createFinding } = useIAFindingMutations();
  const { getCreateFields } = useAuditFields();
  const [itemForm, setItemForm] = useState({ sample_reference: '', result: 'Pass', observation: '', exception_detail: '', na_rationale: '' });
  const [showItemForm, setShowItemForm] = useState(false);
  const [evalTarget, setEvalTarget] = useState<any>(null);
  const [evalForm, setEvalForm] = useState({ disposition: 'No Finding - Isolated', rationale: '', finding_id: '' });
  const [findingMode, setFindingMode] = useState(false);
  const [findingForm, setFindingForm] = useState({ title: '', condition: '', criteria: '', effect: '', risk_rating: 'Medium', recommendation: '' });


  const { data: items = [], isLoading } = useQuery({
    queryKey: ['ia_control_test_results', test.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_control_test_results').select('*').eq('control_test_id', test.id).order('test_item_no');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ['ia_test_exceptions', test.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_test_exceptions').select('*').eq('control_test_id', test.id).order('created_at');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: findings = [] } = useQuery({
    queryKey: ['ia_findings', 'for-exception', auditId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ia_findings').select('id, finding_id, title').eq('engagement_id', auditId).order('created_at');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ia_control_test_results', test.id] });
    qc.invalidateQueries({ queryKey: ['ia_test_exceptions', test.id] });
    qc.invalidateQueries({ queryKey: ['eng_control_tests'] });
  };

  const addItem = useMutation({
    mutationFn: async () => {
      const nextNo = (items.reduce((m: number, i: any) => Math.max(m, i.test_item_no || 0), 0) || 0) + 1;
      const { data, error } = await (supabase as any).from('ia_control_test_results').insert({
        control_test_id: test.id,
        engagement_id: auditId,
        engagement_programme_step_id: test.engagement_programme_step_id || null,
        test_item_no: nextNo,
        sample_reference: itemForm.sample_reference || null,
        result: itemForm.result,
        observation: itemForm.observation || null,
        exception_detail: itemForm.result === 'Exception' ? (itemForm.exception_detail || null) : null,
        tested_by: userCode || null,
        tested_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Sample item recorded' });
      setItemForm({ sample_reference: '', result: 'Pass', observation: '', exception_detail: '' });
      setShowItemForm(false);
      refresh();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const raiseException = useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await (supabase as any).from('ia_test_exceptions').insert({
        engagement_id: auditId,
        control_test_id: test.id,
        sample_result_id: item.id,
        engagement_programme_step_id: test.engagement_programme_step_id || null,
        condition: item.exception_detail || item.observation || `Exception on sample ${item.sample_reference ?? item.test_item_no}`,
        severity: 'Medium',
        created_by: userCode || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast({ title: 'Exception raised' }); refresh(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const evaluate = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('ia_evaluate_test_exception', {
        p_exception_id: evalTarget.id,
        p_disposition: evalForm.disposition,
        p_rationale: evalForm.rationale || null,
        p_finding_id: evalForm.disposition === 'Finding Raised' ? (evalForm.finding_id || null) : null,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Unable to evaluate exception');
      return data;
    },
    onSuccess: () => { toast({ title: 'Exception evaluated' }); setEvalTarget(null); refresh(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const exceptionForItem = (itemId: string) => exceptions.find((x: any) => x.sample_result_id === itemId);
  const concluded = !!test.concluded_at || test.status === 'Concluded';

  return (
    <Card className="border-primary/40">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Sample execution</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sample size and exception counts are derived from the items below. Exceptions must be evaluated by an
          auditor before this test can be concluded — a failed item never becomes a finding on its own.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="divide-y rounded-md border">
            {items.map((it: any) => {
              const exc = exceptionForItem(it.id);
              return (
                <div key={it.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground mr-2">#{it.test_item_no}</span>
                      {it.sample_reference || '—'}
                    </p>
                    {it.observation && <p className="text-xs text-muted-foreground">{it.observation}</p>}
                    {it.exception_detail && <p className="text-xs text-destructive">{it.exception_detail}</p>}
                    {exc && (
                      <p className="mt-1 text-[11px]">
                        <Badge variant={exc.evaluation_status === 'Open' ? 'destructive' : 'outline'}>
                          {exc.evaluation_status === 'Open' ? 'Exception — needs evaluation' : exc.disposition}
                        </Badge>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={it.result === 'Exception' ? 'destructive' : 'outline'}>{it.result}</Badge>
                    {it.result === 'Exception' && !exc && !concluded && (
                      <Button size="sm" variant="outline" onClick={() => raiseException.mutate(it)} disabled={raiseException.isPending}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" />Raise exception
                      </Button>
                    )}
                    {exc && exc.evaluation_status === 'Open' && !concluded && (
                      <Button size="sm" onClick={() => { setEvalTarget(exc); setEvalForm({ disposition: 'No Finding - Isolated', rationale: '', finding_id: '' }); }}>
                        Evaluate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <p className="p-3 text-xs text-muted-foreground">No sample items recorded yet.</p>}
          </div>
        )}

        {!concluded && (showItemForm ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Sample reference</Label><Input value={itemForm.sample_reference} onChange={e => setItemForm(f => ({ ...f, sample_reference: e.target.value }))} placeholder="e.g. PAY-2026-0007" /></div>
              <div><Label>Result</Label>
                <Select value={itemForm.result} onValueChange={v => setItemForm(f => ({ ...f, result: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ITEM_RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Observation</Label><Textarea rows={2} value={itemForm.observation} onChange={e => setItemForm(f => ({ ...f, observation: e.target.value }))} /></div>
            {itemForm.result === 'Exception' && (
              <div><Label>What went wrong</Label><Textarea rows={2} value={itemForm.exception_detail} onChange={e => setItemForm(f => ({ ...f, exception_detail: e.target.value }))} /></div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addItem.mutate()} disabled={addItem.isPending}>
                {addItem.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save item
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowItemForm(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowItemForm(true)}><Plus className="h-4 w-4 mr-1" />Add sample item</Button>
        ))}

        {evalTarget && (
          <div className="space-y-3 rounded-md border border-primary/40 p-3">
            <p className="text-sm font-semibold">Evaluate exception</p>
            <p className="text-xs text-muted-foreground">{evalTarget.condition}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Disposition *</Label>
                <Select value={evalForm.disposition} onValueChange={v => setEvalForm(f => ({ ...f, disposition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DISPOSITIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {evalForm.disposition === 'Finding Raised' ? (
                <div><Label>Linked finding *</Label>
                  <Select value={evalForm.finding_id} onValueChange={v => setEvalForm(f => ({ ...f, finding_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select the finding" /></SelectTrigger>
                    <SelectContent>
                      {findings.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.finding_id ? `${f.finding_id} — ` : ''}{f.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {findings.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Raise the finding on the Findings tab first.</p>}
                </div>
              ) : (
                <div><Label>Severity</Label>
                  <Select value={evalTarget.severity} disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {evalForm.disposition !== 'Finding Raised' && (
              <div><Label>Rationale *</Label><Textarea rows={2} value={evalForm.rationale} onChange={e => setEvalForm(f => ({ ...f, rationale: e.target.value }))} placeholder="Why no finding is raised for this exception" /></div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => evaluate.mutate()} disabled={evaluate.isPending}>
                {evaluate.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save evaluation
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEvalTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
