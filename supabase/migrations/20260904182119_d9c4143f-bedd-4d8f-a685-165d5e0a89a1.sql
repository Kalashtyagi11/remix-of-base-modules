CREATE OR REPLACE FUNCTION public.ia_management_period_bounds(
  p_plan_id uuid,
  p_period_code text DEFAULT 'CURRENT',
  p_custom_start date DEFAULT NULL,
  p_custom_end date DEFAULT NULL,
  p_as_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_plan public.ia_annual_plans%ROWTYPE;
  v_fy   public.core_fiscal_year%ROWTYPE;
  v_s date; v_e date; v_label text; v_code text := upper(COALESCE(p_period_code,'CURRENT'));
BEGIN
  SELECT * INTO v_plan FROM public.ia_annual_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code','plan_not_found'); END IF;

  IF v_plan.fiscal_year_id IS NOT NULL THEN
    SELECT * INTO v_fy FROM public.core_fiscal_year WHERE id = v_plan.fiscal_year_id;
  END IF;
  IF v_fy.id IS NULL THEN
    SELECT * INTO v_fy FROM public.core_fiscal_year
     WHERE code = v_plan.fiscal_year OR display_name = v_plan.fiscal_year LIMIT 1;
  END IF;
  IF v_fy.id IS NULL THEN
    v_fy.start_date := COALESCE(v_plan.planned_start_date, date_trunc('year', p_as_at)::date);
    v_fy.end_date   := COALESCE(v_plan.planned_end_date, (date_trunc('year', p_as_at) + interval '1 year - 1 day')::date);
    v_fy.display_name := v_plan.fiscal_year;
  END IF;

  IF v_code IN ('Q1','Q2','Q3','Q4') THEN
    v_s := (v_fy.start_date + ((substr(v_code,2,1)::int - 1) * interval '3 months'))::date;
    v_e := (v_s + interval '3 months - 1 day')::date;
    v_label := format('%s %s (%s to %s)', v_code, COALESCE(v_fy.display_name, v_plan.fiscal_year, ''),
                      to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSIF v_code = 'MONTH' THEN
    v_s := date_trunc('month', p_as_at)::date;
    v_e := (date_trunc('month', p_as_at) + interval '1 month - 1 day')::date;
    v_label := format('Month %s (%s to %s)', to_char(v_s,'Mon YYYY'),
                      to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSIF v_code = 'YTD' THEN
    v_s := v_fy.start_date;
    v_e := GREATEST(v_s, LEAST(p_as_at::date, v_fy.end_date));
    v_label := format('Year to date (%s to %s)', to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSIF v_code = 'CUSTOM' THEN
    v_s := COALESCE(p_custom_start, v_fy.start_date);
    v_e := GREATEST(v_s, COALESCE(p_custom_end, p_as_at::date));
    v_label := format('Custom period (%s to %s)', to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSE
    -- CURRENT: whole plan life to date, so cumulative movement covers every plan event
    v_code := 'CURRENT';
    v_s := LEAST(v_fy.start_date, COALESCE(v_plan.planned_start_date, v_fy.start_date),
                 COALESCE(v_plan.created_date, v_plan.created_at, now())::date);
    v_e := GREATEST(p_as_at::date, v_fy.end_date);
    v_label := format('Current status — plan to date (%s to %s)',
                      to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'label', v_label,
    'start', v_s, 'end', v_e,
    'fiscal_year', COALESCE(v_fy.display_name, v_plan.fiscal_year),
    'fiscal_start', v_fy.start_date, 'fiscal_end', v_fy.end_date);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_management_period_bounds(uuid, text, date, date, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_management_period_bounds(uuid, text, date, date, timestamptz)
  TO authenticated, service_role;