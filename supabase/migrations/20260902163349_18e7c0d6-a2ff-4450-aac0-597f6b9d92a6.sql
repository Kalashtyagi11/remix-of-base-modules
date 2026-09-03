
REVOKE INSERT, UPDATE ON public.core_fiscal_year FROM anon;

-- Boundary marker: records created before the enterprise fiscal calendar existed
-- are historical, not current configuration blockers.
CREATE OR REPLACE FUNCTION public.core_fiscal_calendar_epoch()
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(min(created_at), now()) FROM public.core_fiscal_year;
$$;

CREATE OR REPLACE FUNCTION public.ia_fiscal_configuration_health()
RETURNS TABLE (
  check_code text,
  title text,
  severity text,
  status text,
  affected_count integer,
  detail text,
  drill_ref text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_epoch timestamptz := public.core_fiscal_calendar_epoch();
  v_years int;
  v_open  int;
  v_n     int;
BEGIN
  SELECT count(*) INTO v_years FROM public.core_fiscal_year WHERE is_active;
  check_code := 'FISCAL_MASTER_PRESENT';
  title := 'Enterprise fiscal calendar configured';
  severity := 'CRITICAL';
  status := CASE WHEN v_years > 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_years;
  detail := v_years || ' active fiscal year(s) defined';
  drill_ref := '/admin/fiscal-calendar';
  RETURN NEXT;

  SELECT count(*) INTO v_open FROM public.core_fiscal_year
   WHERE is_active AND planning_open AND status <> 'CLOSED';
  check_code := 'FISCAL_PLANNING_OPEN';
  title := 'At least one fiscal year open for planning';
  severity := 'CRITICAL';
  status := CASE WHEN v_open > 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_open;
  detail := v_open || ' planning-eligible year(s)';
  drill_ref := '/admin/fiscal-calendar';
  RETURN NEXT;

  SELECT count(*) INTO v_n FROM public.ia_annual_plans p
   WHERE p.fiscal_year_id IS NULL AND p.created_at >= v_epoch;
  check_code := 'PLAN_MISSING_CANONICAL_YEAR';
  title := 'New annual plans reference the canonical fiscal year';
  severity := 'CRITICAL';
  status := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_n;
  detail := v_n || ' plan(s) created after the fiscal calendar was established lack a canonical fiscal year';
  drill_ref := '/audit/annual-plans';
  RETURN NEXT;

  SELECT count(*) INTO v_n FROM public.ia_annual_plans p
   WHERE p.fiscal_year_id IS NULL AND p.created_at < v_epoch;
  check_code := 'PLAN_LEGACY_FISCAL_TEXT';
  title := 'Historical plans retained on legacy fiscal-year text';
  severity := 'INFO';
  status := 'HISTORICAL';
  affected_count := v_n;
  detail := v_n || ' pre-calendar plan(s) retained per the explicit reconciliation map (no silent coercion)';
  drill_ref := '/admin/fiscal-calendar';
  RETURN NEXT;

  SELECT count(*) INTO v_n
    FROM public.ia_audit_engagements e
    JOIN public.ia_annual_plans p ON p.id = e.annual_plan_id
    JOIN public.core_fiscal_year f ON f.id = p.fiscal_year_id
   WHERE e.planned_start_date IS NOT NULL
     AND COALESCE(btrim(e.fiscal_period_exception_reason), '') = ''
     AND (e.planned_start_date < f.start_date OR e.planned_start_date > f.end_date
          OR (e.planned_end_date IS NOT NULL AND e.planned_end_date > f.end_date));
  check_code := 'ENGAGEMENT_DATES_IN_FISCAL_YEAR';
  title := 'Engagement dates fall inside the plan fiscal year';
  severity := 'CRITICAL';
  status := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_n;
  detail := v_n || ' engagement(s) outside the fiscal period without a governed exception';
  drill_ref := '/audit/engagements';
  RETURN NEXT;

  SELECT count(*) INTO v_n
    FROM public.ia_audit_engagements e
    JOIN public.ia_annual_plans p ON p.id = e.annual_plan_id
    JOIN public.core_fiscal_year f ON f.id = p.fiscal_year_id
   WHERE e.planned_start_date IS NOT NULL
     AND public.core_fiscal_quarter_of(f.id, e.planned_start_date) IS NOT NULL
     AND e.quarter IS DISTINCT FROM public.core_fiscal_quarter_of(f.id, e.planned_start_date);
  check_code := 'QUARTER_DERIVATION_CONSISTENT';
  title := 'Quarter matches the derived fiscal quarter';
  severity := 'WARNING';
  status := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_n;
  detail := v_n || ' engagement(s) whose stored quarter differs from the derived fiscal quarter';
  drill_ref := '/audit/engagements';
  RETURN NEXT;

  SELECT count(*) INTO v_n FROM public.ia_plan_carry_forward c
   WHERE c.created_at >= v_epoch
     AND (c.target_fiscal_year_id IS NULL
          OR NOT public.core_fiscal_year_planning_eligible(c.target_fiscal_year_id));
  check_code := 'CARRY_FORWARD_TARGET_VALID';
  title := 'Carry-forward targets a valid planning-open fiscal year';
  severity := 'CRITICAL';
  status := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_n;
  detail := v_n || ' carry-forward record(s) with an invalid or ineligible target year';
  drill_ref := '/audit/annual-plans';
  RETURN NEXT;

  SELECT count(*) INTO v_n FROM public.ia_follow_ups u
   WHERE u.created_at >= v_epoch AND u.fiscal_year IS NOT NULL AND u.fiscal_year_id IS NULL;
  check_code := 'FOLLOW_UP_FISCAL_GOVERNED';
  title := 'Follow-up fiscal periods are master-backed';
  severity := 'WARNING';
  status := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  affected_count := v_n;
  detail := v_n || ' follow-up(s) holding unmastered fiscal text';
  drill_ref := '/audit/follow-ups';
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.ia_fiscal_configuration_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_fiscal_configuration_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.core_fiscal_calendar_epoch() TO authenticated;
