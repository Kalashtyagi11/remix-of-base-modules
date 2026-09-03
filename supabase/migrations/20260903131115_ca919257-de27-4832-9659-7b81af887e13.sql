CREATE OR REPLACE FUNCTION public.bn_mature_payment_schedule(
  p_as_of date DEFAULT CURRENT_DATE,
  p_award_id uuid DEFAULT NULL,
  p_performed_by text DEFAULT 'SYSTEM'
)
RETURNS TABLE (
  schedule_id uuid,
  claim_number text,
  due_date date,
  outcome text,
  reason text,
  instruction_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r            record;
  v_claim      record;
  v_new_id     uuid;
  v_amount     numeric;
  v_dup        uuid;
  v_payee      text;
BEGIN
  -- Only an authenticated app user or a server/cron role may run this.
  IF auth.uid() IS NULL
     AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'BN_MATURATION_FORBIDDEN';
  END IF;

  -- Single-flight: a second concurrent run exits instead of double-generating.
  IF NOT pg_try_advisory_xact_lock(hashtext('bn_mature_payment_schedule')) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::date,
                        'SKIPPED'::text, 'ALREADY_RUNNING'::text, NULL::uuid;
    RETURN;
  END IF;

  -- 1. Maturation: PROJECTED -> DUE on/after due date
  FOR r IN
    SELECT s.id, s.claim_number, s.due_date
    FROM bn_payment_schedule s
    JOIN bn_award a ON a.id = s.bn_award_id
    LEFT JOIN bn_entitlement e ON e.id = s.entitlement_id
    WHERE s.status = 'PROJECTED'
      AND s.due_date IS NOT NULL
      AND s.due_date <= p_as_of
      AND a.status IN ('ACTIVE', 'REINSTATED')
      AND (e.id IS NULL OR e.status = 'ACTIVE')
      AND (p_award_id IS NULL OR s.bn_award_id = p_award_id)
    ORDER BY s.due_date
  LOOP
    UPDATE bn_payment_schedule
       SET status = 'DUE', modified_by = p_performed_by, modified_at = now()
     WHERE id = r.id;

    schedule_id := r.id; claim_number := r.claim_number; due_date := r.due_date;
    outcome := 'MATURED'; reason := NULL; instruction_id := NULL;
    RETURN NEXT;
  END LOOP;

  -- 2. Generation: DUE / ARREARS -> GENERATED with a payable
  FOR r IN
    SELECT s.*, a.status AS award_status
    FROM bn_payment_schedule s
    JOIN bn_award a ON a.id = s.bn_award_id
    LEFT JOIN bn_entitlement e ON e.id = s.entitlement_id
    WHERE s.status IN ('DUE', 'ARREARS')
      AND s.bn_payment_instruction_id IS NULL
      AND s.due_date IS NOT NULL
      AND s.due_date <= p_as_of
      AND a.status IN ('ACTIVE', 'REINSTATED')
      AND (e.id IS NULL OR e.status = 'ACTIVE')
      AND (p_award_id IS NULL OR s.bn_award_id = p_award_id)
    ORDER BY s.due_date
  LOOP
    schedule_id := r.id; claim_number := r.claim_number; due_date := r.due_date;
    instruction_id := NULL;

    v_amount := COALESCE(r.amount, r.net_amount, r.gross_amount, 0);
    IF v_amount <= 0 THEN
      outcome := 'SKIPPED'; reason := 'ZERO_AMOUNT'; RETURN NEXT; CONTINUE;
    END IF;

    SELECT c.* INTO v_claim FROM bn_claim c WHERE c.id = r.claim_id;
    IF v_claim.id IS NULL THEN
      outcome := 'SKIPPED'; reason := 'CLAIM_NOT_FOUND'; RETURN NEXT; CONTINUE;
    END IF;

    SELECT pi.id INTO v_dup
    FROM bn_payment_instruction pi
    WHERE pi.claim_id = r.claim_id
      AND pi.due_date = r.due_date
      AND COALESCE(pi.status, '') <> 'CANCELLED'
    LIMIT 1;

    IF v_dup IS NOT NULL THEN
      UPDATE bn_payment_schedule
         SET status = 'GENERATED',
             bn_payment_instruction_id = v_dup,
             instruction_id = v_dup,
             modified_by = p_performed_by,
             modified_at = now()
       WHERE id = r.id;
      outcome := 'SKIPPED'; reason := 'ALREADY_PAYABLE'; instruction_id := v_dup;
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', m.firstname, m.surname)), ''), r.ssn)
      INTO v_payee
    FROM au_ip_master m WHERE m.ssn = r.ssn LIMIT 1;

    INSERT INTO bn_payment_instruction (
      entitlement_id, claim_id, ssn, amount, currency,
      payment_method, bank_code, account_number,
      due_date, frequency, status, instruction_type,
      beneficiary_name, payee_name, period_start, period_end,
      office_code, description
    ) VALUES (
      r.entitlement_id, r.claim_id, r.ssn, v_amount, COALESCE(r.currency, 'XCD'),
      CASE WHEN COALESCE(v_claim.bank_account, '') <> '' THEN 'DIRECT_DEPOSIT' ELSE 'CHEQUE' END,
      v_claim.bank_routing_number, v_claim.bank_account,
      r.due_date, r.frequency, 'READY',
      CASE WHEN r.status = 'ARREARS' THEN 'ARREARS' ELSE 'PERIODIC' END,
      COALESCE(v_payee, r.ssn), COALESCE(v_payee, r.ssn),
      COALESCE(r.period_start, r.due_date), COALESCE(r.period_end, r.due_date),
      'HQ',
      'Scheduled periodic payment ' || COALESCE(r.claim_number, '') || ' ' || r.due_date::text
    )
    RETURNING id INTO v_new_id;

    UPDATE bn_payment_schedule
       SET status = 'GENERATED',
           bn_payment_instruction_id = v_new_id,
           instruction_id = v_new_id,
           modified_by = p_performed_by,
           modified_at = now()
     WHERE id = r.id;

    INSERT INTO bn_claim_event (
      claim_id, event_type, from_status, to_status, notes, performed_by, performed_at, metadata
    ) VALUES (
      r.claim_id, 'SCHEDULE_INSTRUCTION_GENERATED', r.status, 'GENERATED',
      'Payable generated by schedule maturation', p_performed_by, now(),
      jsonb_build_object(
        'schedule_row_id', r.id,
        'entity_type', 'PAYMENT_SCHEDULE',
        'payment_instruction_id', v_new_id,
        'as_of', p_as_of
      )
    );

    outcome := 'GENERATED'; reason := NULL; instruction_id := v_new_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.bn_mature_payment_schedule(date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bn_mature_payment_schedule(date, uuid, text) TO authenticated, service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bn-mature-payment-schedule')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bn-mature-payment-schedule');
    PERFORM cron.schedule(
      'bn-mature-payment-schedule',
      '0 2 * * *',
      $job$ SELECT public.bn_mature_payment_schedule(CURRENT_DATE, NULL, 'CRON'); $job$
    );
  END IF;
END
$cron$;