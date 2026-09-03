-- Guard the governed Award Setup -> Payment Queue hand-off: a claim may not
-- leave AWARD_SETUP for PAYMENT_QUEUE unless an award record exists, because
-- the payment schedule is generated from the award.
-- Additive and idempotent: no schema change, guard only.

CREATE OR REPLACE FUNCTION public.zz_bn_claim_payment_handoff_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status, '') = 'AWARD_SETUP'
     AND NEW.status = 'PAYMENT_QUEUE'
     AND NOT EXISTS (
       SELECT 1 FROM public.bn_award a WHERE a.bn_claim_id = NEW.id
     )
  THEN
    RAISE EXCEPTION
      'BN_AWARD_REQUIRED: claim % has no award record; create the award before sending it to Payment.',
      COALESCE(NEW.claim_number, NEW.id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_bn_claim_payment_handoff_guard ON public.bn_claim;

CREATE TRIGGER zz_bn_claim_payment_handoff_guard
BEFORE UPDATE OF status ON public.bn_claim
FOR EACH ROW
EXECUTE FUNCTION public.zz_bn_claim_payment_handoff_guard();