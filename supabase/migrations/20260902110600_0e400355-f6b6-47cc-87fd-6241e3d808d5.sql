-- =====================================================================
-- Stage 2A: Enterprise Fiscal Calendar Foundation
-- Platform convention evidence: ssb_contribution_calendar_policy.fiscal_year_start_month = 1
--                               bn_country.fiscal_year_start_month = 1 (SKN)
-- => Fiscal year = calendar year (01 Jan - 31 Dec). Canonical label style: FY<YYYY>.
-- No RLS per docs/ARCHITECTURE-NO-RLS-RULE.md; authorization is role-based.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.core_fiscal_year (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.core_organization(id),
  code            text NOT NULL,
  display_name    text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'OPEN',
  is_active       boolean NOT NULL DEFAULT true,
  planning_open   boolean NOT NULL DEFAULT true,
  notes           text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT core_fiscal_year_status_chk CHECK (status IN ('DRAFT','OPEN','CLOSED')),
  CONSTRAINT core_fiscal_year_dates_chk CHECK (start_date <= end_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.core_fiscal_year TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.core_fiscal_year TO anon;
GRANT ALL ON public.core_fiscal_year TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS core_fiscal_year_code_uidx
  ON public.core_fiscal_year (organization_id, upper(code));
CREATE INDEX IF NOT EXISTS core_fiscal_year_range_idx
  ON public.core_fiscal_year (organization_id, start_date, end_date);

CREATE OR REPLACE FUNCTION public.core_fiscal_year_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_core_fiscal_year_updated_at ON public.core_fiscal_year;
CREATE TRIGGER trg_core_fiscal_year_updated_at
  BEFORE UPDATE ON public.core_fiscal_year
  FOR EACH ROW EXECUTE FUNCTION public.core_fiscal_year_set_updated_at();

-- Overlap prohibition (single continuous fiscal calendar per organisation).
CREATE OR REPLACE FUNCTION public.core_fiscal_year_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_conflict text;
BEGIN
  IF NEW.start_date > NEW.end_date THEN
    RAISE EXCEPTION 'CORE_FISCAL_YEAR_INVALID_RANGE: start_date must be on or before end_date';
  END IF;
  SELECT code INTO v_conflict
  FROM public.core_fiscal_year f
  WHERE f.organization_id = NEW.organization_id
    AND f.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND daterange(f.start_date, f.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'CORE_FISCAL_YEAR_OVERLAP: period overlaps existing fiscal year %', v_conflict;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_core_fiscal_year_guard ON public.core_fiscal_year;
CREATE TRIGGER trg_core_fiscal_year_guard
  BEFORE INSERT OR UPDATE ON public.core_fiscal_year
  FOR EACH ROW EXECUTE FUNCTION public.core_fiscal_year_guard();

-- Canonical derivation helpers -----------------------------------------
CREATE OR REPLACE FUNCTION public.core_fiscal_year_for_date(p_date date, p_organization_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT f.id FROM public.core_fiscal_year f
  WHERE (p_organization_id IS NULL OR f.organization_id = p_organization_id)
    AND p_date BETWEEN f.start_date AND f.end_date
  ORDER BY f.start_date LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.core_fiscal_quarter_of(p_fiscal_year_id uuid, p_date date)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_start date; v_end date; v_months int;
BEGIN
  IF p_fiscal_year_id IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;
  SELECT start_date, end_date INTO v_start, v_end FROM public.core_fiscal_year WHERE id = p_fiscal_year_id;
  IF v_start IS NULL OR p_date < v_start OR p_date > v_end THEN RETURN NULL; END IF;
  v_months := (date_part('year', p_date)::int - date_part('year', v_start)::int) * 12
            + (date_part('month', p_date)::int - date_part('month', v_start)::int);
  RETURN 'Q' || LEAST(4, GREATEST(1, (v_months / 3) + 1));
END; $$;

CREATE OR REPLACE FUNCTION public.core_fiscal_year_planning_eligible(p_fiscal_year_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active AND planning_open AND status <> 'CLOSED'
                   FROM public.core_fiscal_year WHERE id = p_fiscal_year_id), false);
$$;

-- Seed the organisation's fiscal calendar (Jan-Dec convention) ---------
INSERT INTO public.core_fiscal_year (organization_id, code, display_name, start_date, end_date, status, is_active, planning_open, created_by, notes)
SELECT o.id,
       'FY' || y::text,
       'FY' || y::text,
       make_date(y, 1, 1),
       make_date(y, 12, 31),
       CASE WHEN y < 2026 THEN 'CLOSED' ELSE 'OPEN' END,
       true,
       (y >= 2026),
       'STAGE-2A-FISCAL-FOUNDATION',
       'Seeded from platform fiscal_year_start_month = 1 (calendar year convention)'
FROM public.core_organization o
CROSS JOIN generate_series(2025, 2030) AS y
WHERE o.org_code = 'SKN-SSB'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Internal Audit binding
-- =====================================================================
ALTER TABLE public.ia_annual_plans      ADD COLUMN IF NOT EXISTS fiscal_year_id uuid REFERENCES public.core_fiscal_year(id);
ALTER TABLE public.ia_follow_ups        ADD COLUMN IF NOT EXISTS fiscal_year_id uuid REFERENCES public.core_fiscal_year(id);
ALTER TABLE public.ia_plan_carry_forward ADD COLUMN IF NOT EXISTS source_fiscal_year_id uuid REFERENCES public.core_fiscal_year(id);
ALTER TABLE public.ia_plan_carry_forward ADD COLUMN IF NOT EXISTS target_fiscal_year_id uuid REFERENCES public.core_fiscal_year(id);
ALTER TABLE public.ia_audit_engagements ADD COLUMN IF NOT EXISTS fiscal_period_exception_reason text;

CREATE INDEX IF NOT EXISTS ia_annual_plans_fiscal_year_id_idx ON public.ia_annual_plans (fiscal_year_id);

-- Annual Plan master validation ---------------------------------------
CREATE OR REPLACE FUNCTION public.zz_ia_annual_plan_fiscal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; v_org uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'IA_FISCAL_YEAR_REQUIRED: a canonical Fiscal Year must be selected for a new annual plan';
  END IF;

  IF NEW.fiscal_year_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id) THEN
    SELECT * INTO r FROM public.core_fiscal_year WHERE id = NEW.fiscal_year_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_NOT_FOUND: fiscal year % does not exist', NEW.fiscal_year_id;
    END IF;
    SELECT id INTO v_org FROM public.core_organization WHERE org_code = 'SKN-SSB';
    IF v_org IS NOT NULL AND r.organization_id <> v_org THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_WRONG_ORGANISATION: fiscal year % belongs to another organisation', r.code;
    END IF;
    IF NOT r.is_active THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_INACTIVE: fiscal year % is inactive', r.code;
    END IF;
    IF TG_OP = 'INSERT' AND NOT (r.planning_open AND r.status <> 'CLOSED') THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_NOT_ELIGIBLE: fiscal year % is not open for planning', r.code;
    END IF;
    -- text column becomes a display snapshot of the master
    NEW.fiscal_year := r.code;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS zz_ia_annual_plan_fiscal_guard ON public.ia_annual_plans;
CREATE TRIGGER zz_ia_annual_plan_fiscal_guard
  BEFORE INSERT OR UPDATE ON public.ia_annual_plans
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_annual_plan_fiscal_guard();

-- Engagement temporal integrity ---------------------------------------
CREATE OR REPLACE FUNCTION public.zz_ia_engagement_fiscal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fy record;
BEGIN
  IF NEW.annual_plan_id IS NOT NULL THEN
    SELECT f.* INTO v_fy
    FROM public.ia_annual_plans p
    JOIN public.core_fiscal_year f ON f.id = p.fiscal_year_id
    WHERE p.id = NEW.annual_plan_id;
  END IF;

  IF v_fy.id IS NULL THEN
    -- legacy plan without canonical fiscal year: leave historical values untouched
    RETURN NEW;
  END IF;

  IF NEW.planned_start_date IS NOT NULL THEN
    IF (NEW.planned_start_date < v_fy.start_date OR NEW.planned_start_date > v_fy.end_date
        OR (NEW.planned_end_date IS NOT NULL AND NEW.planned_end_date > v_fy.end_date))
       AND COALESCE(btrim(NEW.fiscal_period_exception_reason), '') = '' THEN
      RAISE EXCEPTION 'IA_ENGAGEMENT_DATE_OUT_OF_FISCAL_YEAR: planned dates fall outside fiscal year % (% to %); record a governed exception reason to proceed',
        v_fy.code, v_fy.start_date, v_fy.end_date;
    END IF;
    -- quarter/month are derived, never authoritative user input
    NEW.quarter := COALESCE(public.core_fiscal_quarter_of(v_fy.id, NEW.planned_start_date), NEW.quarter);
    NEW.month := to_char(NEW.planned_start_date, 'FMMonth');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS zz_ia_engagement_fiscal_guard ON public.ia_audit_engagements;
CREATE TRIGGER zz_ia_engagement_fiscal_guard
  BEFORE INSERT OR UPDATE ON public.ia_audit_engagements
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_engagement_fiscal_guard();

-- Follow-up fiscal year derivation ------------------------------------
CREATE OR REPLACE FUNCTION public.zz_ia_follow_up_fiscal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_code text;
BEGIN
  IF NEW.fiscal_year_id IS NULL AND NEW.scheduled_follow_up_date IS NOT NULL THEN
    NEW.fiscal_year_id := public.core_fiscal_year_for_date(NEW.scheduled_follow_up_date, NULL);
  END IF;
  IF NEW.fiscal_year_id IS NOT NULL THEN
    SELECT code INTO v_code FROM public.core_fiscal_year WHERE id = NEW.fiscal_year_id AND is_active;
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_NOT_FOUND: follow-up references an unknown or inactive fiscal year';
    END IF;
    NEW.fiscal_year := v_code;
  ELSIF TG_OP = 'INSERT' THEN
    -- arbitrary free text is never authoritative
    NEW.fiscal_year := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS zz_ia_follow_up_fiscal_guard ON public.ia_follow_ups;
CREATE TRIGGER zz_ia_follow_up_fiscal_guard
  BEFORE INSERT OR UPDATE ON public.ia_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_follow_up_fiscal_guard();

-- Carry-forward fiscal validation --------------------------------------
CREATE OR REPLACE FUNCTION public.zz_ia_carry_forward_fiscal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.target_fiscal_year_id IS NOT NULL THEN
    SELECT * INTO r FROM public.core_fiscal_year WHERE id = NEW.target_fiscal_year_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_NOT_FOUND: carry-forward target fiscal year does not exist';
    END IF;
    IF NOT (r.is_active AND r.planning_open AND r.status <> 'CLOSED') THEN
      RAISE EXCEPTION 'IA_FISCAL_YEAR_NOT_ELIGIBLE: carry-forward target fiscal year % is not eligible', r.code;
    END IF;
    NEW.target_fiscal_year := r.code;
  ELSIF TG_OP = 'INSERT' AND COALESCE(btrim(NEW.target_fiscal_year), '') <> '' THEN
    RAISE EXCEPTION 'IA_FISCAL_YEAR_REQUIRED: carry-forward must reference a canonical target fiscal year, not free text';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS zz_ia_carry_forward_fiscal_guard ON public.ia_plan_carry_forward;
CREATE TRIGGER zz_ia_carry_forward_fiscal_guard
  BEFORE INSERT OR UPDATE ON public.ia_plan_carry_forward
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_carry_forward_fiscal_guard();

-- =====================================================================
-- Legacy reconciliation map (explicit, no silent coercion)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ia_fiscal_year_migration_map (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid NOT NULL,
  plan_title          text,
  legacy_fiscal_year  text,
  classification      text NOT NULL,
  fiscal_year_id      uuid REFERENCES public.core_fiscal_year(id),
  mapping_confidence  text NOT NULL,
  action              text NOT NULL,
  rationale           text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ia_fiscal_year_migration_map TO authenticated, anon;
GRANT ALL ON public.ia_fiscal_year_migration_map TO service_role;

INSERT INTO public.ia_fiscal_year_migration_map
  (plan_id, plan_title, legacy_fiscal_year, classification, fiscal_year_id, mapping_confidence, action, rationale)
SELECT p.id, p.title, p.fiscal_year,
  CASE
    WHEN p.fiscal_year ILIKE '%CANARY%' THEN 'TEST_CANARY'
    WHEN p.fiscal_year = '2099-2100' THEN 'NEGATIVE_TEST'
    WHEN p.fiscal_year ~ '^\d{4}-\d{4}$' THEN 'FORMAT_VARIANT_OF_EXISTING_YEAR'
    WHEN p.fiscal_year ~ '^\d{4}$' AND f.id IS NOT NULL THEN 'BUSINESS_FISCAL_YEAR'
    WHEN p.fiscal_year ~ '^\d{4}$' THEN 'UNKNOWN'
    ELSE 'UNKNOWN'
  END,
  f.id,
  CASE WHEN f.id IS NOT NULL THEN 'DETERMINISTIC' ELSE 'NONE' END,
  CASE
    WHEN f.id IS NOT NULL THEN 'MAP_TO_MASTER'
    WHEN p.fiscal_year ILIKE '%CANARY%' OR p.fiscal_year = '2099-2100' THEN 'TEST_FIXTURE_ONLY'
    WHEN p.fiscal_year ~ '^\d{4}-\d{4}$' THEN 'NEEDS_BUSINESS_DECISION'
    ELSE 'RETAIN_LEGACY_SNAPSHOT'
  END,
  CASE
    WHEN f.id IS NOT NULL THEN 'Single-year value unambiguous under the Jan-Dec convention and present in the seeded enterprise calendar.'
    WHEN p.fiscal_year ILIKE '%CANARY%' OR p.fiscal_year = '2099-2100' THEN 'Test fixture value; deliberately not promoted to the enterprise master.'
    WHEN p.fiscal_year ~ '^\d{4}-\d{4}$' THEN 'Cross-year label cannot map to a single Jan-Dec fiscal year without a business decision.'
    ELSE 'Outside the seeded enterprise planning horizon; retained as historical snapshot only.'
  END
FROM public.ia_annual_plans p
LEFT JOIN public.core_fiscal_year f
  ON p.fiscal_year ~ '^\d{4}$' AND f.code = 'FY' || p.fiscal_year
WHERE NOT EXISTS (SELECT 1 FROM public.ia_fiscal_year_migration_map m WHERE m.plan_id = p.id);

-- Governed backfill of deterministic mappings only (no lifecycle change)
DO $$
DECLARE m record;
BEGIN
  PERFORM set_config('ia.governed_plan_write', 'on', true);
  FOR m IN SELECT plan_id, fiscal_year_id FROM public.ia_fiscal_year_migration_map WHERE action = 'MAP_TO_MASTER'
  LOOP
    UPDATE public.ia_annual_plans SET fiscal_year_id = m.fiscal_year_id WHERE id = m.plan_id AND fiscal_year_id IS NULL;
  END LOOP;
  PERFORM set_config('ia.governed_plan_write', 'off', true);
END $$;