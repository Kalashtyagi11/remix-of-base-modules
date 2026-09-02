import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Stepper } from '@/components/ui/stepper';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, AlertTriangle, Loader2, ArrowRight, ArrowLeft, Zap, Users, FileText, Calendar } from 'lucide-react';
import { useCheckDataReadiness, useGenerateAutoPlan, useGenerateResourceRecommendations, useCapacitySchedule, useConvertCandidates, useAutoPlanCandidates, useWizardState } from '@/hooks/useAutoPlanEngine';
import { useUserCode } from '@/hooks/useUserCode';
import { AutoPlanSuggestions } from './AutoPlanSuggestions';
import { CapacityCalendarPanel } from './CapacityCalendarPanel';
import { useToast } from '@/hooks/use-toast';

interface PlanningWizardProps {
  planId: string;
  planStatus: string;
  fiscalYear?: string;
  onComplete?: () => void;
}

const WIZARD_STEPS = [
  { id: 'scope', title: 'Scope & Cycle' },
  { id: 'parameters', title: 'Parameter Profile' },
  { id: 'readiness', title: 'Data Readiness' },
  { id: 'generate', title: 'Generate Suggestions' },
  { id: 'resources', title: 'Resource Assignment' },
  { id: 'review', title: 'Review & Override' },
  { id: 'publish', title: 'Publish Baseline' },
];

export function PlanningWizard({ planId, planStatus, fiscalYear, onComplete }: PlanningWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [scopeData, setScopeData] = useState({ fiscal_year: fiscalYear || '', cycle_type: 'annual', notes: '' });
  const [paramProfile, setParamProfile] = useState('global');
  const [readinessResult, setReadinessResult] = useState<any>(null);
  const [publishNotes, setPublishNotes] = useState('');

  const { userCode } = useUserCode();
  const { toast } = useToast();
  const checkReadiness = useCheckDataReadiness();
  const generatePlan = useGenerateAutoPlan(planId);
  const generateRecs = useGenerateResourceRecommendations(planId);
  const capacitySchedule = useCapacitySchedule(planId);
  const convertCandidates = useConvertCandidates(planId);
  const { data: candidates = [] } = useAutoPlanCandidates(planId);
  const { data: wizardState, upsertState } = useWizardState(planId);

  const accepted = candidates.filter((c: any) => c.status === 'Accepted');

  useEffect(() => {
    if (wizardState?.current_step) {
      setCurrentStep(wizardState.current_step - 1);
    }
  }, [wizardState]);

  const saveWizardState = (step: number) => {
    upsertState.mutate({
      plan_id: planId,
      current_step: step + 1,
      step_data: { scope: scopeData, paramProfile },
      data_readiness: readinessResult || {},
      parameter_profile: paramProfile,
      updated_by: userCode || 'system',
    });
  };

  const goNext = () => {
    const next = Math.min(currentStep + 1, WIZARD_STEPS.length - 1);
    setCurrentStep(next);
    saveWizardState(next);
  };

  const goBack = () => {
    const prev = Math.max(currentStep - 1, 0);
    setCurrentStep(prev);
    saveWizardState(prev);
  };

  const handleCheckReadiness = async () => {
    const result = await checkReadiness.mutateAsync(planId);
    setReadinessResult(result);
  };

  const handleGenerate = async () => {
    await generatePlan.mutateAsync();
    goNext();
  };

  const handleGenerateResources = async () => {
    await generateRecs.mutateAsync(undefined);
  };

  const handlePublish = async () => {
    if (accepted.length === 0) {
      toast({ title: 'No Accepted Candidates', description: 'Accept at least one candidate before publishing.', variant: 'destructive' });
      return;
    }
    await convertCandidates.mutateAsync(userCode || 'system');
    saveWizardState(WIZARD_STEPS.length - 1);
    toast({ title: 'Plan Published', description: `${accepted.length} engagements created as baseline.` });
    onComplete?.();
  };

  const steps = WIZARD_STEPS.map((s, i) => ({
    ...s,
    status: i < currentStep ? 'completed' as const : i === currentStep ? 'current' as const : 'upcoming' as const,
  }));

  return (
    <div className="space-y-4">
      <Stepper steps={steps} currentStep={currentStep} onStepClick={(i) => { if (i <= currentStep) setCurrentStep(i); }} />

      {/* Step 1: Scope */}
      {currentStep === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" />Scope & Cycle Definition</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fiscal Year</Label>
                <Input value={scopeData.fiscal_year} onChange={(e) => setScopeData(s => ({ ...s, fiscal_year: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Cycle Type</Label>
                <Select value={scopeData.cycle_type} onValueChange={(v) => setScopeData(s => ({ ...s, cycle_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Planning Notes</Label>
              <Textarea value={scopeData.notes} onChange={(e) => setScopeData(s => ({ ...s, notes: e.target.value }))} placeholder="Optional notes about this planning cycle..." rows={3} />
            </div>
            <div className="flex justify-end">
              <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Parameter Profile */}
      {currentStep === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Parameter Profile Selection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Select which parameter scope to use for scoring. Parameters resolve with precedence: Scenario → Plan → Function → Department → Global.</p>
            <Select value={paramProfile} onValueChange={setParamProfile}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global Defaults</SelectItem>
                <SelectItem value="plan">Plan-Specific Overrides</SelectItem>
                <SelectItem value="scenario">What-If Scenario</SelectItem>
              </SelectContent>
            </Select>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Active Profile: {paramProfile}</p>
              <p>The scoring engine will use parameters at the <strong>{paramProfile}</strong> scope. Any function/department-level overrides will take precedence where configured.</p>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Data Readiness */}
      {currentStep === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />Data Readiness Check</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Verify that all required data sources are populated before generating suggestions.</p>
            <Button onClick={handleCheckReadiness} disabled={checkReadiness.isPending}>
              {checkReadiness.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Run Readiness Check
            </Button>

            {readinessResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Departments', value: readinessResult.departments },
                    { label: 'Functions', value: readinessResult.functions },
                    { label: 'Assessed', value: readinessResult.assessed_functions },
                    { label: 'Active Auditors', value: readinessResult.active_auditors },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border p-3 text-center">
                      <p className="text-xl font-semibold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>

                {(readinessResult.warnings || []).length > 0 && (
                  <div className="space-y-2">
                    {readinessResult.warnings.map((w: any, i: number) => (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded text-xs ${w.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                        {w.type === 'error' ? <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Badge variant={readinessResult.ready ? 'default' : 'destructive'} className={readinessResult.ready ? 'bg-green-600' : ''}>
                    {readinessResult.ready ? 'Ready to Generate' : 'Issues Found'}
                  </Badge>
                  {!readinessResult.weights_valid && (
                    <Badge variant="destructive">Weights Invalid</Badge>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={goNext} disabled={readinessResult && !readinessResult.ready}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Generate */}
      {currentStep === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Generate Suggestions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The engine will score all active department functions using the configured weights and parameters, then rank them by composite priority score.
            </p>
            <Button onClick={handleGenerate} disabled={generatePlan.isPending} size="lg">
              {generatePlan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              {candidates.length > 0 ? 'Re-Generate Suggestions' : 'Generate Suggestions'}
            </Button>
            {candidates.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {candidates.length} candidates currently generated. Re-generating will replace existing suggestions.
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              {candidates.length > 0 && (
                <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Resource Assignment */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Resource Assignment Assistant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate auditor recommendations based on availability, skills, prior involvement, and rotation policy.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleGenerateResources} disabled={generateRecs.isPending}>
                {generateRecs.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Users className="h-4 w-4 mr-1" />}
                Generate Resource Recommendations
              </Button>
              <Button variant="outline" onClick={() => capacitySchedule.mutate()} disabled={capacitySchedule.isPending}>
                {capacitySchedule.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calendar className="h-4 w-4 mr-1" />}
                Auto-Schedule Capacity
              </Button>
            </div>
            <CapacityCalendarPanel planId={planId} />
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Review & Override */}
      {currentStep === 5 && (
        <div className="space-y-4">
          <AutoPlanSuggestions planId={planId} planStatus={planStatus} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* Step 7: Publish */}
      {currentStep === 6 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Publish Baseline</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-medium">Publishing Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-muted-foreground">Fiscal Year:</span>
                <span className="font-medium">{scopeData.fiscal_year}</span>
                <span className="text-muted-foreground">Candidates Generated:</span>
                <span className="font-medium">{candidates.length}</span>
                <span className="text-muted-foreground">Accepted:</span>
                <span className="font-medium text-green-600">{accepted.length}</span>
                <span className="text-muted-foreground">Rejected:</span>
                <span className="font-medium text-destructive">{candidates.filter((c: any) => c.status === 'Rejected').length}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Changelog Notes</Label>
              <Textarea
                value={publishNotes}
                onChange={(e) => setPublishNotes(e.target.value)}
                placeholder="Summary of planning decisions, overrides, and rationale..."
                rows={3}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={handlePublish} disabled={convertCandidates.isPending || accepted.length === 0}>
                {convertCandidates.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Publish & Create Engagements ({accepted.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
