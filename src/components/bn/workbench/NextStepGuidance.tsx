/**
 * Next-Step Guidance Panel
 *
 * Inspects the claim's current state (status, eligibility, calculation,
 * decision, entitlement, payable) and tells the officer exactly what to
 * do next, with a one-click action button.
 *
 * Spec sections 1, 8, 9.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBlockingMutation } from '@/hooks/useBlockingMutation';
import { useUserCode } from '@/hooks/useUserCode';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useBnAvailableActions } from '@/hooks/bn/useBnDecisionEngine';
import { executeTransition } from '@/services/bn/decisionEngine';
import { stepForClaimStatus } from '@/services/bn/workflow/claimStatusStepMap';
import { expectedBasketCodesForStage } from '@/services/bn/workflow/stageBasketExpectation';
import { toast } from 'sonner';
import { showBlockerToast } from '@/lib/bn/showBlockerToast';
import { BnBusyButton } from '@/components/bn/shared';
import {
  submitClaimForDecision,
  approveClaim,
  generatePayableForApprovedClaim,
} from '@/services/bn/postApprovalOrchestrator';

const db = supabase as any;


interface Props {
  claimId: string;
  status: string;
  hasEligibilityPass: boolean;
  hasCalculation: boolean;
  /** Opens a workbench tab — used to send the officer to Documents on a refusal. */
  onJumpTab?: (tab: string) => void;
}

interface DownstreamState {
  hasEntitlement: boolean;
  hasPayable: boolean;
  hasAward: boolean;
  payableId?: string;
  /**
   * Payment-issue readiness for the claim's payables:
   * - 'none' — payable exists but is not in any batch (batching is next)
   * - 'in_batch' — payable is in a batch that has not been released yet
   * - 'released' — payable is in a RELEASED (or later) batch awaiting issue prep
   * - 'issued_prep' — an issue record exists, so the payable shows in /bn/issue
   */
  issueReadiness: 'none' | 'in_batch' | 'released' | 'issued_prep' | null;
  batchStatus?: string;
}

async function fetchDownstream(claimId: string): Promise<DownstreamState> {
  const [{ data: ents }, { data: pis }, { data: awards }] = await Promise.all([
    db.from('bn_entitlement').select('id').eq('claim_id', claimId).limit(1),
    db.from('bn_payment_instruction').select('id').eq('claim_id', claimId),
    db.from('bn_award').select('id').eq('bn_claim_id', claimId).limit(1),
  ]);
  const payableIds = (pis ?? []).map((p: any) => p.id);

  let issueReadiness: DownstreamState['issueReadiness'] = null;
  let batchStatus: string | undefined;
  if (payableIds.length > 0) {
    const [{ data: issues }, { data: items }] = await Promise.all([
      db.from('bn_issue_record').select('id').in('instruction_id', payableIds).limit(1),
      db.from('bn_batch_item')
        .select('id, item_status, bn_payment_batch(status)')
        .in('instruction_id', payableIds)
        .neq('item_status', 'REMOVED'),
    ]);
    if ((issues?.length || 0) > 0) {
      issueReadiness = 'issued_prep';
    } else if ((items?.length || 0) > 0) {
      const statuses = items.map((i: any) => i.bn_payment_batch?.status).filter(Boolean);
      batchStatus = statuses[0];
      issueReadiness = statuses.some((s: string) => ['RELEASED', 'ISSUED', 'PARTIALLY_ISSUED'].includes(s))
        ? 'released'
        : 'in_batch';
    } else {
      issueReadiness = 'none';
    }
  }

  return {
    hasEntitlement: (ents?.length || 0) > 0,
    hasPayable: payableIds.length > 0,
    hasAward: (awards?.length || 0) > 0,
    payableId: payableIds[0],
    issueReadiness,
    batchStatus,
  };
}

/** Claim statuses where an award should already exist. */
const AWARD_EXPECTED_STATUSES = ['AWARD_SETUP', 'PAYMENT_QUEUE', 'IN_PAYMENT'];

export const NextStepGuidance: React.FC<Props> = ({
  claimId, status, hasEligibilityPass, hasCalculation, onJumpTab,
}) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // isLoading and error matter here: userCode starts null and the profile is
  // fetched asynchronously, so acting on `!userCode` alone reports a missing
  // user code while it is merely still loading.
  const { userCode, isLoading: userCodeLoading, error: userCodeError } = useUserCode();

  const { data: downstream } = useQuery({
    queryKey: ['bn', 'next-step-downstream', claimId, status],
    queryFn: () => fetchDownstream(claimId),
  });

  // Which basket owns the claim right now — an officer looking at Award Setup
  // could not otherwise tell that the claim has not been handed to Payment.
  const {
    data: basket,
    isPending: basketPending,
    isFetching: basketFetching,
    isError: basketError,
  } = useQuery({
    queryKey: ['bn', 'next-step-basket', claimId, status],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const { data } = await db
        .from('bn_claim_queue_assignment')
        .select('workbasket_id, bn_workbasket(basket_code, basket_name)')
        .eq('claim_id', claimId)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
        .limit(1);
      const row = (data ?? [])[0];
      return row?.bn_workbasket
        ? { code: row.bn_workbasket.basket_code as string, name: row.bn_workbasket.basket_name as string }
        : null;
    },
  });

  // The governed AWARD_SETUP → PAYMENT_QUEUE hand-off. Reuses the configured
  // transition rule; no new status, rule or table is introduced here.
  const { roles: authRoles } = useSupabaseAuth();
  const userRoles = authRoles && authRoles.length > 0 ? authRoles : [];
  const { data: actions } = useBnAvailableActions(claimId, userRoles);
  const paymentAction = useMemo(
    () => (actions ?? []).find((a: any) => a?.rule?.to_status === 'PAYMENT_QUEUE') ?? null,
    [actions],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bn', 'claim', claimId] });
    qc.invalidateQueries({ queryKey: ['bn', 'next-step-downstream', claimId] });
    qc.invalidateQueries({ queryKey: ['bn', 'next-step-basket', claimId] });
    qc.invalidateQueries({ queryKey: ['bn', 'available-actions', claimId] });
    qc.invalidateQueries({ queryKey: ['bn', 'claim-events', claimId] });
    // Workbasket views: claim list per basket, basket list, my queue, and counts
    qc.invalidateQueries({ queryKey: ['bn', 'queue'] });
    qc.invalidateQueries({ queryKey: ['bn', 'queue-claims'] });
    qc.invalidateQueries({ queryKey: ['bn', 'workbaskets'] });
    qc.invalidateQueries({ queryKey: ['bn', 'my-queue'] });
    qc.invalidateQueries({ queryKey: ['bn', 'basket-claim-counts'] });
    qc.invalidateQueries({ queryKey: ['bn', 'payables'] });
    qc.invalidateQueries({ queryKey: ['bn', 'entitlements'] });
    qc.invalidateQueries({ queryKey: ['bn', 'awards'] });
  };


  /**
   * Four different situations used to produce one message, so an officer could
   * not tell a still-loading profile from an account that needs configuring.
   */
  const guard = () => {
    if (userCodeLoading) {
      toast.error('Still loading your profile', {
        description: 'Your user code has not arrived yet. Try again in a moment.',
      });
      return false;
    }
    if (userCodeError) {
      toast.error('Could not read your profile', {
        description: `${userCodeError}. Your user code is required to record this action.`,
      });
      return false;
    }
    if (!userCode) {
      toast.error('Your account has no user code', {
        description:
          'Every Benefits action is recorded against a user code, and none is set on your ' +
          'profile. Ask an administrator to set one before continuing.',
      });
      return false;
    }
    return true;
  };

  /** True while no action can be taken, so buttons can be disabled rather than fail on click. */
  const actionsBlocked = userCodeLoading || !!userCodeError || !userCode;

  const submitMut = useBlockingMutation({
    mutationFn: () => submitClaimForDecision(claimId, userCode!),
    onSuccess: () => { toast.success('Submitted for decision'); invalidate(); },
    onError: (e: any) => toast.error('Failed', { description: e?.message }),
  }, 'Submitting for decision...');

  const approveMut = useBlockingMutation({
    mutationFn: () => approveClaim(claimId, userCode!),
    onSuccess: (r: any) => { toast.success(r.message || 'Approved'); invalidate(); },
    // A refusal names each unmet condition on its own line, and outstanding
    // documents are the common one — so the officer is pointed straight at the
    // Documents tab to upload and verify, then approve.
    onError: (e: any) => {
      const text = String(e?.message ?? '');
      showBlockerToast(text, {
        fallbackTitle: 'Approval refused',
        duration: 14_000,
      });
      if (/document/i.test(text)) {
        onJumpTab?.('documents');
      }
    },
  }, 'Approving claim...');


  const generateMut = useBlockingMutation({
    mutationFn: () => generatePayableForApprovedClaim(claimId, userCode!),
    onSuccess: (r: any) => { toast.success(r.message || 'Generated'); invalidate(); },
    onError: (e: any) => toast.error('Generation failed', { description: e?.message }),
  }, 'Generating payable...');

  // Repair path for claims approved before the award record was created on the
  // approval path: creates the missing award (and its first schedule row) so
  // Payment Preparation can generate a payment schedule.
  const awardMut = useBlockingMutation({
    mutationFn: async () => {
      const { createAwardFromApprovedClaim } = await import('@/services/bn/paymentBoundaryService');
      const res = await createAwardFromApprovedClaim({
        claimId,
        performedBy: userCode!,
        force: true,
        source: 'workbench_repair',
      });
      if (!res) throw new Error('The award could not be created for this claim.');
      return res;
    },
    onSuccess: () => { toast.success('Award created'); invalidate(); },
    onError: (e: any) => toast.error('Award creation failed', { description: e?.message }),
  }, 'Creating award...');

  // Hands the claim itself over to Payment Preparation. The payment
  // instruction already lives in the Payables Queue; this moves the claim.
  const handoffMut = useBlockingMutation({
    mutationFn: async () => {
      if (!paymentAction) throw new Error('No hand-off action is configured from this status.');
      return executeTransition({
        claimId,
        actionCode: paymentAction.rule.action_code,
        ruleId: paymentAction.rule.id,
        performedBy: userCode!,
      });
    },
    onSuccess: () => { toast.success('Claim sent to Payment Preparation'); invalidate(); },
    onError: (e: any) => toast.error('Hand-off failed', { description: e?.message }),
  }, 'Sending to payment...');

  // Does the basket that owns the claim match the one its status implies?
  // Routing after a status change is deliberately non-blocking, so a claim can
  // keep its old basket without anything failing. Surface it rather than hide it.
  const disposition = stepForClaimStatus(status);
  const expectedCodes =
    disposition?.kind === 'STEP' ? expectedBasketCodesForStage(disposition.step) : [];
  const expectedCode = expectedCodes[0] ?? null;

  const { data: expectedBasket } = useQuery({
    queryKey: ['bn', 'expected-basket', expectedCode],
    enabled: !!expectedCode,
    queryFn: async () => {
      const { data } = await db
        .from('bn_workbasket')
        .select('basket_code, basket_name')
        .eq('basket_code', expectedCode)
        .eq('is_active', true)
        .maybeSingle();
      return data ?? null;
    },
  });

  const basketMismatch = useMemo(() => {
    // Never diagnose from cached data while the authoritative assignment is
    // still loading/refetching, or when it could not be read.
    if (basketPending || basketFetching || basketError) return null;
    if (!expectedCode || !basket?.code) return null;
    if (basket.code === expectedCode) return null;
    return {
      expectedCode,
      expectedName: expectedBasket?.basket_name ?? expectedCode,
    };
  }, [expectedCode, basket?.code, expectedBasket, basketPending, basketFetching, basketError]);


  const step = useMemo(() => {
    // Blocked states first
    if (!hasEligibilityPass && !['APPROVED', 'AWARD_SETUP', 'IN_PAYMENT', 'PAYMENT_QUEUE', 'DENIED', 'CLOSED'].includes(status)) {
      return {
        tone: 'blocked' as const,
        title: 'Eligibility not yet passed',
        body: 'Run eligibility (or have an override approved) before submitting for decision.',
      };
    }
    if (!hasCalculation && ['INTAKE', 'CALCULATION', 'ELIGIBILITY_CHECK', 'EVIDENCE_REVIEW'].includes(status)) {
      return {
        tone: 'action' as const,
        title: 'Eligibility passed — Run Calculation',
        body: 'Open the Calculation tab and run the calculation engine. Once complete, you can submit for decision.',
        actionLabel: 'Go to Calculation',
        onAction: () => {
          const url = new URL(window.location.href);
          url.searchParams.set('tab', 'calculation');
          window.location.hash = '';
          navigate(url.pathname + url.search);
        },
      };
    }

    // CALCULATION → submit for decision (also handles INTAKE if officer skipped status change)
    if (['CALCULATION', 'INTAKE', 'ELIGIBILITY_CHECK'].includes(status) && hasCalculation) {
      return {
        tone: 'action' as const,
        title: 'Calculation complete — Submit for Decision',
        body: 'Send this claim to the decision queue for approval.',
        actionLabel: 'Submit for Decision',
        onAction: () => { if (guard()) submitMut.mutate(); },
        pending: submitMut.isPending || userCodeLoading,
      };
    }

    if (status === 'DECISION' || status === 'PENDING_APPROVAL') {
      return {
        tone: 'action' as const,
        title: 'Awaiting decision',
        body: 'Approve, deny or send back. Approval auto-creates the entitlement or payable.',
        actionLabel: 'Approve Claim',
        onAction: () => { if (guard()) approveMut.mutate(); },
        pending: approveMut.isPending || userCodeLoading,
      };
    }

    if (status === 'APPROVED' && !downstream?.hasEntitlement && !downstream?.hasPayable) {
      return {
        tone: 'action' as const,
        title: 'Decision approved — no payable yet',
        body: 'Generate the entitlement / payable record so the claim can be paid.',
        actionLabel: 'Generate Payable',
        onAction: () => { if (guard()) generateMut.mutate(); },
        pending: generateMut.isPending || userCodeLoading,
      };
    }

    // Award missing on a claim that is already past approval — offer the repair
    // before any payment guidance, because the schedule cannot be built without it.
    if (
      downstream && !downstream.hasAward &&
      (AWARD_EXPECTED_STATUSES.includes(status) || (status === 'APPROVED' && downstream.hasEntitlement))
    ) {
      return {
        tone: 'blocked' as const,
        title: 'No award record for this claim',
        body: 'This claim has an entitlement but no award, so a payment schedule cannot be generated. Create the award to continue.',
        actionLabel: 'Create Award',
        onAction: () => { if (guard()) awardMut.mutate(); },
        pending: awardMut.isPending || userCodeLoading,
      };
    }

    // Award Setup: the money is ready, but the claim still sits in the Award
    // Setup basket until the governed hand-off is executed.
    if (status === 'AWARD_SETUP' && paymentAction) {
      const where = basket?.name ? `It is currently in the ${basket.name} basket. ` : '';
      if (paymentAction.blocked) {
        return {
          tone: 'blocked' as const,
          title: 'Hand-off to Payment not available to you',
          body: `${where}${paymentAction.blockedReason ?? 'This action is restricted.'}`,
          actionLabel: 'Open Payables Queue',
          onAction: () => navigate('/bn/payables'),
        };
      }
      return {
        tone: 'action' as const,
        title: 'Award set up — send the claim to Payment',
        body:
          `${where}The payment instruction is already in the Payables Queue; ` +
          `use ${paymentAction.rule.action_label || 'Send to Payment'} to move the claim itself into Payment Preparation.`,
        actionLabel: paymentAction.rule.action_label || 'Send to Payment',
        onAction: () => { if (guard()) handoffMut.mutate(); },
        pending: handoffMut.isPending || userCodeLoading,
        secondaryLabel: 'Open Payables Queue',
        onSecondary: () => navigate('/bn/payables'),
      };
    }

    // The claim's status and its freshly-read basket disagree. This is
    // diagnostic only: officers must never force a basket assignment from the
    // workbench. The governed lifecycle/routing path remains authoritative.
    if (basketMismatch) {
      return {
        tone: 'blocked' as const,
        title: 'Basket routing needs attention',
        body:
          `This claim is ${status.replace(/_/g, ' ').toLowerCase()}, which belongs to the ` +
          `${basketMismatch.expectedName} desk, but it is still sitting in the ` +
          `${basket?.name ?? 'previous'} basket. Complete the governed lifecycle action, or contact an administrator if routing has failed.`,
      };
    }

    // Payment issue desk. The claim is with the issuing desk, but it only
    // appears on the Payment Issue screen once its payable has been batched,
    // validated, approved, released and prepared for issue — guide the officer
    // to the true next step instead of an empty issue screen.
    if (status === 'IN_PAYMENT') {
      const ready = downstream?.issueReadiness;
      if (ready === 'none') {
        return {
          tone: 'action' as const,
          title: 'Ready to batch for payment',
          body:
            `${basket?.name ? `Claim is in the ${basket.name} basket. ` : ''}` +
            'The payable must be added to a batch, validated, approved and released before it appears in Payment Issue.',
          actionLabel: 'Open Payables Queue',
          onAction: () => navigate('/bn/payables'),
          secondaryLabel: 'Open Batch Operations',
          onSecondary: () => navigate('/bn/batch'),
        };
      }
      if (ready === 'in_batch' || ready === 'released') {
        return {
          tone: 'info' as const,
          title: ready === 'released' ? 'Batch released — prepare issue' : 'Payable is in a batch',
          body:
            `${basket?.name ? `Claim is in the ${basket.name} basket. ` : ''}` +
            (ready === 'released'
              ? 'The batch is released. Prepare issue from Batch Operations so the payable appears in Payment Issue.'
              : `The batch is ${downstream?.batchStatus?.replace(/_/g, ' ').toLowerCase() ?? 'in progress'}. It must be validated, approved and released before issue.`),
          actionLabel: 'Open Batch Operations',
          onAction: () => navigate('/bn/batch'),
          secondaryLabel: 'Open Payables Queue',
          onSecondary: () => navigate('/bn/payables'),
        };
      }
      return {
        tone: 'success' as const,
        title: 'With the Payment Issue desk',
        body:
          `${basket?.name ? `Claim is in the ${basket.name} basket. ` : ''}` +
          'Generate the cheque or EFT instrument in Payment Issue, then reconcile it in Post-Issue Review.',
        actionLabel: 'Open Payment Issue',
        onAction: () => navigate('/bn/issue'),
        secondaryLabel: 'Open Payables Queue',
        onSecondary: () => navigate('/bn/payables'),
      };
    }

    if (downstream?.hasPayable && ['PAYMENT_QUEUE', 'AWARD_SETUP', 'APPROVED'].includes(status)) {
      return {
        tone: 'success' as const,
        title: 'Payment instruction created',
        body: `${basket?.name ? `Claim is in the ${basket.name} basket. ` : ''}Continue in the Payables Queue to schedule, batch and issue payment.`,
        actionLabel: 'Open Payables Queue',
        onAction: () => navigate('/bn/payables'),
      };
    }



    if (downstream?.hasEntitlement && !downstream?.hasPayable) {
      return {
        tone: 'info' as const,
        title: 'Entitlement active',
        body: 'No outstanding payable. Generate the next scheduled payment from the Payables Queue when due.',
        actionLabel: 'Open Payables Queue',
        onAction: () => navigate('/bn/payables'),
      };
    }

    if (status === 'DENIED' || status === 'CLOSED' || status === 'WITHDRAWN') {
      return {
        tone: 'success' as const,
        title: `Claim ${status.toLowerCase()}`,
        body: 'No further action required on this claim.',
      };
    }

    return null;
  }, [status, hasEligibilityPass, hasCalculation, downstream, basket, basketMismatch, paymentAction, submitMut.isPending, approveMut.isPending, generateMut.isPending, awardMut.isPending, handoffMut.isPending, userCodeLoading]);

  if (!step) return null;

  const Icon = step.tone === 'success' ? CheckCircle2 : step.tone === 'blocked' ? AlertTriangle : Sparkles;
  const variant: 'default' | 'destructive' = step.tone === 'blocked' ? 'destructive' : 'default';

  return (
    <Alert variant={variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{step.title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
        <span>{step.body}</span>
        <span className="flex items-center gap-2">
        {('secondaryLabel' in step) && (step as any).secondaryLabel && (step as any).onSecondary && (
          <Button variant="outline" size="sm" onClick={(step as any).onSecondary}>
            {(step as any).secondaryLabel}
          </Button>
        )}
        {('actionLabel' in step) && step.actionLabel && step.onAction && (
          <BnBusyButton loading={('pending' in step) ? !!step.pending : false}
            size="sm"
            onClick={step.onAction}
            // Disabled while the user code is unavailable, so the action cannot
            // be attempted and then refused.
            disabled={actionsBlocked || (('pending' in step) ? !!step.pending : false)}
            title={
              userCodeLoading
                ? 'Loading your profile…'
                : userCodeError
                  ? `Your profile could not be read: ${userCodeError}`
                  : !userCode
                    ? 'Your account has no user code — ask an administrator to set one'
                    : undefined
            }
          >
            {userCodeLoading ? 'Loading…' : step.actionLabel}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </BnBusyButton>
        )}
        </span>

      </AlertDescription>
    </Alert>
  );
};
