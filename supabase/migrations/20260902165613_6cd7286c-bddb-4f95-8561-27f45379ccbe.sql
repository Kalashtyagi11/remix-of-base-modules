-- ============================================================
-- Stage 2A-S : Enterprise Fiscal Master authorization closure
-- DEF-E2E-013. Forward-only, additive.
-- ============================================================

-- 1) Table privileges: no direct mutation from browser roles.
REVOKE INSERT, UPDATE, DELETE ON public.core_fiscal_year FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.core_fiscal_year FROM authenticated;
REVOKE ALL ON public.core_fiscal_year FROM anon;
GRANT SELECT ON public.core_fiscal_year TO authenticated;
GRANT ALL ON public.core_fiscal_year TO service_role;

-- 2) Central platform master-data capability.
--    Enterprise master data => platform/system administration authority only.
--    Deliberately NOT tied to any Internal Audit persona.
CREATE OR REPLACE FUNCTION public.core_master_data_actor_can(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND (
       public.is_admin(_user_id)
       OR public.has_permission(_user_id, 'admin_master_data', 'manage')
       OR public.has_permission(_user_id, 'enterprise_configuration_centre', 'manage')
     )
$$;

-- 3) Server-derived organisation context (single-organisation deployment).
CREATE OR REPLACE FUNCTION public.core_current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id FROM public.core_organization o ORDER BY o.created_at NULLS FIRST, o.org_code LIMIT 1
$$;

-- 4) Internal helpers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public._core_fiscal_require_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FISCAL_MASTER_UNAUTHENTICATED: sign-in required.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.core_master_data_actor_can(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_MASTER_FORBIDDEN: central platform master-data administration authority is required.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public._core_fiscal_audit(
  _uid uuid, _action text, _row public.core_fiscal_year, _before jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text; v_email text;
BEGIN
  SELECT p.full_name, p.email INTO v_name, v_email FROM public.profiles p WHERE p.id = _uid;
  INSERT INTO public.core_audit_log(
    event_code, event_name, event_category, severity, risk_level,
    actor_user_id, actor_name, actor_email,
    module_code, domain_code, entity_type, entity_id, entity_display_name,
    action, outcome, before_value, after_value, source, source_service
  ) VALUES (
    'CORE.FISCAL_YEAR.' || _action, 'Fiscal Year ' || _action, 'MASTER_DATA', 'INFO', 'MEDIUM',
    _uid, v_name, v_email,
    'CORE', 'FISCAL_CALENDAR', 'core_fiscal_year', _row.id::text, _row.code,
    _action, 'SUCCESS', _before, to_jsonb(_row), 'GOVERNED_RPC', 'core_fiscal_year'
  );
END;
$$;

-- 5) Governed commands ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.core_fiscal_year_create(
  p_code text,
  p_display_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status text DEFAULT 'OPEN',
  p_is_active boolean DEFAULT true,
  p_planning_open boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS public.core_fiscal_year
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_org uuid; v_row public.core_fiscal_year; v_actor text;
BEGIN
  v_uid := public._core_fiscal_require_admin();
  v_org := public.core_current_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CORE_ORGANISATION_NOT_CONFIGURED: no organisation is configured.';
  END IF;
  IF coalesce(btrim(p_code), '') = '' THEN
    RAISE EXCEPTION 'FISCAL_YEAR_CODE_REQUIRED';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'FISCAL_YEAR_DATES_REQUIRED';
  END IF;
  IF coalesce(p_status, 'OPEN') NOT IN ('DRAFT', 'OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'FISCAL_YEAR_STATUS_INVALID: %', p_status;
  END IF;

  SELECT coalesce(p.user_code, p.email, v_uid::text) INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.core_fiscal_year(
    organization_id, code, display_name, start_date, end_date,
    status, is_active, planning_open, notes, created_by, updated_by
  ) VALUES (
    v_org, btrim(p_code), coalesce(nullif(btrim(p_display_name), ''), btrim(p_code)),
    p_start_date, p_end_date, coalesce(p_status, 'OPEN'),
    coalesce(p_is_active, true), coalesce(p_planning_open, true), nullif(btrim(p_notes), ''),
    coalesce(v_actor, v_uid::text), coalesce(v_actor, v_uid::text)
  ) RETURNING * INTO v_row;

  PERFORM public._core_fiscal_audit(v_uid, 'CREATE', v_row, NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.core_fiscal_year_update(
  p_id uuid,
  p_code text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_planning_open boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.core_fiscal_year
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_before public.core_fiscal_year; v_row public.core_fiscal_year; v_actor text;
BEGIN
  v_uid := public._core_fiscal_require_admin();
  SELECT * INTO v_before FROM public.core_fiscal_year WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: %', p_id;
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT', 'OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'FISCAL_YEAR_STATUS_INVALID: %', p_status;
  END IF;

  SELECT coalesce(p.user_code, p.email, v_uid::text) INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  UPDATE public.core_fiscal_year SET
    code          = coalesce(nullif(btrim(p_code), ''), code),
    display_name  = coalesce(nullif(btrim(p_display_name), ''), display_name),
    start_date    = coalesce(p_start_date, start_date),
    end_date      = coalesce(p_end_date, end_date),
    status        = coalesce(p_status, status),
    is_active     = coalesce(p_is_active, is_active),
    planning_open = coalesce(p_planning_open, planning_open),
    notes         = coalesce(p_notes, notes),
    updated_by    = coalesce(v_actor, v_uid::text),
    updated_at    = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  PERFORM public._core_fiscal_audit(v_uid, 'UPDATE', v_row, to_jsonb(v_before));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.core_fiscal_year_set_status(p_id uuid, p_status text)
RETURNS public.core_fiscal_year
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.core_fiscal_year;
BEGIN
  v_row := public.core_fiscal_year_update(
    p_id := p_id,
    p_status := p_status,
    p_planning_open := CASE WHEN p_status = 'CLOSED' THEN false ELSE NULL END
  );
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.core_fiscal_year_set_active(p_id uuid, p_is_active boolean)
RETURNS public.core_fiscal_year
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.core_fiscal_year;
BEGIN
  v_row := public.core_fiscal_year_update(p_id := p_id, p_is_active := p_is_active);
  RETURN v_row;
END;
$$;

-- 6) Execute privileges: authenticated only (authority enforced inside).
REVOKE ALL ON FUNCTION public.core_fiscal_year_create(text, text, date, date, text, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.core_fiscal_year_update(uuid, text, text, date, date, text, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.core_fiscal_year_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.core_fiscal_year_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._core_fiscal_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._core_fiscal_audit(uuid, text, public.core_fiscal_year, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.core_fiscal_year_create(text, text, date, date, text, boolean, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.core_fiscal_year_update(uuid, text, text, date, date, text, boolean, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.core_fiscal_year_set_status(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.core_fiscal_year_set_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.core_master_data_actor_can(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.core_current_organization_id() TO authenticated, service_role;