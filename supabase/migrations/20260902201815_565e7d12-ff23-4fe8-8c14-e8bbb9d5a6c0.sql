
CREATE OR REPLACE FUNCTION public.zz_ia_engagement_fiscal_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy    record;
  v_found boolean := false;
BEGIN
  IF NEW.annual_plan_id IS NOT NULL THEN
    SELECT f.* INTO v_fy
    FROM public.ia_annual_plans p
    JOIN public.core_fiscal_year f ON f.id = p.fiscal_year_id
    WHERE p.id = NEW.annual_plan_id;
    v_found := FOUND;
  END IF;

  IF NOT v_found OR v_fy.id IS NULL THEN
    -- standalone engagement, or legacy plan without canonical fiscal year:
    -- leave historical values untouched
    RETURN NEW;
  END IF;

  IF NEW.planned_start_date IS NOT NULL THEN
    IF (NEW.planned_start_date < v_fy.start_date OR NEW.planned_start_date > v_fy.end_date
        OR (NEW.planned_end_date IS NOT NULL AND NEW.planned_end_date > v_fy.end_date))
       AND COALESCE(btrim(NEW.fiscal_period_exception_reason), '') = '' THEN
      RAISE EXCEPTION 'IA_ENGAGEMENT_DATE_OUT_OF_FISCAL_YEAR: planned dates fall outside fiscal year % (% to %); record a governed exception reason to proceed',
        v_fy.code, v_fy.start_date, v_fy.end_date;
    END IF;
    NEW.quarter := COALESCE(public.core_fiscal_quarter_of(v_fy.id, NEW.planned_start_date), NEW.quarter);
    NEW.month := to_char(NEW.planned_start_date, 'FMMonth');
  END IF;

  RETURN NEW;
END;
$$;
