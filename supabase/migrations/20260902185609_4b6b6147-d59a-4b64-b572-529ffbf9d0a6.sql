-- =====================================================================
-- IA STAGE 2B — Reference Master & Classification Convergence
-- Additive, idempotent. Closes DEF-E2E-007 / DEF-E2E-008 (+ Follow-Up Type)
-- =====================================================================

-- 1. Reference type register -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_reference_type (
  code           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ia_reference_type TO authenticated;
GRANT ALL ON public.ia_reference_type TO service_role;
ALTER TABLE public.ia_reference_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_reference_type_read ON public.ia_reference_type;
CREATE POLICY ia_reference_type_read ON public.ia_reference_type
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

-- 2. Reference value register ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_reference_value (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type  TEXT NOT NULL REFERENCES public.ia_reference_type(code),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  effective_from  DATE,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS ia_reference_value_type_code_uk
  ON public.ia_reference_value (reference_type, upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS ia_reference_value_type_name_uk
  ON public.ia_reference_value (reference_type, lower(name));
CREATE INDEX IF NOT EXISTS ia_reference_value_type_idx
  ON public.ia_reference_value (reference_type, is_active, display_order);

GRANT SELECT ON public.ia_reference_value TO authenticated;
GRANT ALL ON public.ia_reference_value TO service_role;
ALTER TABLE public.ia_reference_value ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_reference_value_read ON public.ia_reference_value;
CREATE POLICY ia_reference_value_read ON public.ia_reference_value
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());
-- deliberately NO insert/update/delete policies: governed RPCs only.

REVOKE INSERT, UPDATE, DELETE ON public.ia_reference_value FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ia_reference_type FROM authenticated, anon;

-- physical delete forbidden (historical transactions reference these rows)
CREATE OR REPLACE FUNCTION public.ia_reference_value_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IA_REFERENCE_DELETE_FORBIDDEN: deactivate instead of deleting %/%',
    OLD.reference_type, OLD.code;
END $$;

DROP TRIGGER IF EXISTS zz_ia_reference_value_no_delete ON public.ia_reference_value;
CREATE TRIGGER zz_ia_reference_value_no_delete
  BEFORE DELETE ON public.ia_reference_value
  FOR EACH ROW EXECUTE FUNCTION public.ia_reference_value_no_delete();

-- 3. Seed reference types ----------------------------------------------------
INSERT INTO public.ia_reference_type (code, name, description, display_order) VALUES
  ('AUDIT_TYPE',        'Audit / Engagement Type', 'Nature of the audit engagement', 10),
  ('COVERAGE_CATEGORY', 'Coverage Category',       'Why the engagement is in the audit universe / plan coverage basis', 20),
  ('FOLLOW_UP_TYPE',    'Follow-Up Type',          'Nature of a follow-up activity', 30)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed canonical values ---------------------------------------------------
INSERT INTO public.ia_reference_value (reference_type, code, name, description, display_order, is_system) VALUES
  ('AUDIT_TYPE','PLANNED_AUDIT','Planned Audit','Engagement included in the approved annual plan',10,true),
  ('AUDIT_TYPE','ADHOC_AUDIT','Ad-hoc Audit','Unplanned engagement added during the year',20,true),
  ('AUDIT_TYPE','MANAGEMENT_REQUESTED','Management Requested Audit','Requested by management or the board',30,true),
  ('AUDIT_TYPE','SPECIAL_INVESTIGATION','Special Investigation','Investigative engagement',40,true),
  ('AUDIT_TYPE','FOLLOW_UP_AUDIT','Follow-up Audit','Engagement verifying prior audit actions',50,true),
  ('AUDIT_TYPE','ASSURANCE','Assurance','Assurance engagement',60,true),
  ('AUDIT_TYPE','OPERATIONAL','Operational','Operational audit engagement',70,true),
  ('AUDIT_TYPE','COMPLIANCE','Compliance','Compliance audit engagement',80,true),
  ('AUDIT_TYPE','SUPPLEMENTARY','Supplementary','Supplementary engagement to an existing audit',90,true),

  ('COVERAGE_CATEGORY','CORE_COVERAGE','Core Coverage','Mandatory recurring coverage of the audit universe',10,true),
  ('COVERAGE_CATEGORY','RISK_DRIVEN','Risk-Driven','Selected because of assessed risk',20,true),
  ('COVERAGE_CATEGORY','CYCLICAL','Cyclical','Selected on a rotational cycle',30,true),
  ('COVERAGE_CATEGORY','COMPLIANCE','Compliance','Statutory or regulatory coverage requirement',40,true),
  ('COVERAGE_CATEGORY','FINANCIAL','Financial','Financial reporting or controls coverage',50,true),
  ('COVERAGE_CATEGORY','OPERATIONAL','Operational','Operational process coverage',60,true),
  ('COVERAGE_CATEGORY','IT','IT','Information technology coverage',70,true),
  ('COVERAGE_CATEGORY','GOVERNANCE','Governance','Governance and oversight coverage',80,true),
  ('COVERAGE_CATEGORY','SPECIAL','Special','Special or one-off coverage basis',90,true),

  ('FOLLOW_UP_TYPE','ACTION_VERIFICATION','Action Verification','Verification of an agreed management action',10,true),
  ('FOLLOW_UP_TYPE','IMPLEMENTATION_CHECK','Implementation Check','Check that a recommendation was implemented',20,true),
  ('FOLLOW_UP_TYPE','EVIDENCE_COLLECTION','Evidence Collection','Collection of supporting evidence',30,true),
  ('FOLLOW_UP_TYPE','RE_TEST','Re-Test','Re-performance of a control test',40,true),
  ('FOLLOW_UP_TYPE','MANAGEMENT_MEETING','Management Meeting','Follow-up meeting with management',50,true),
  ('FOLLOW_UP_TYPE','NEXT_AUDIT','Next Audit','Deferred to the next audit of the area',60,true),
  ('FOLLOW_UP_TYPE','OTHER','Other','Other follow-up activity',90,true)
ON CONFLICT DO NOTHING;

-- 5. Resolution / validation helpers ----------------------------------------
CREATE OR REPLACE FUNCTION public.ia_reference_assert_id(_type TEXT, _id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.ia_reference_value%ROWTYPE;
BEGIN
  IF _id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.ia_reference_value WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: no % reference with id %', _type, _id;
  END IF;
  IF r.reference_type <> _type THEN
    RAISE EXCEPTION 'IA_WRONG_REFERENCE_TYPE: % belongs to % but % was required',
      r.code, r.reference_type, _type;
  END IF;
  IF NOT r.is_active THEN
    RAISE EXCEPTION 'IA_INACTIVE_REFERENCE: % / % is inactive', _type, r.code;
  END IF;
  RETURN r.id;
END $$;

-- resolve free text (legacy or UI display) to a canonical ACTIVE reference id
CREATE OR REPLACE FUNCTION public.ia_reference_resolve(_type TEXT, _value TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id UUID; v_norm TEXT;
BEGIN
  IF _value IS NULL OR btrim(_value) = '' THEN RETURN NULL; END IF;
  v_norm := btrim(_value);

  SELECT id INTO v_id FROM public.ia_reference_value
   WHERE reference_type = _type AND is_active
     AND (lower(name) = lower(v_norm)
          OR upper(code) = upper(replace(replace(replace(v_norm,' ','_'),'-','_'),'/','_')))
   ORDER BY display_order LIMIT 1;

  RETURN v_id; -- NULL means unresolved; caller decides the failure mode
END $$;

-- risk vocabulary guard: canonical risk bands are owned by
-- ia_risk_classification_thresholds and must never be a coverage category
CREATE OR REPLACE FUNCTION public.ia_is_risk_band_label(_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _value IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ia_risk_classification_thresholds t
    WHERE lower(t.label) = lower(btrim(_value))
  );
$$;

GRANT EXECUTE ON FUNCTION public.ia_reference_assert_id(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_reference_resolve(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_is_risk_band_label(TEXT) TO authenticated;

-- 6. Canonical reference columns on transactional tables ---------------------
ALTER TABLE public.ia_audit_engagements
  ADD COLUMN IF NOT EXISTS engagement_type_id UUID REFERENCES public.ia_reference_value(id),
  ADD COLUMN IF NOT EXISTS coverage_category_id UUID REFERENCES public.ia_reference_value(id);

ALTER TABLE public.ia_follow_ups
  ADD COLUMN IF NOT EXISTS follow_up_type_id UUID REFERENCES public.ia_reference_value(id);

-- 7. Server-side validation triggers (authority is here, not the UI) ---------
CREATE OR REPLACE FUNCTION public.ia_engagement_reference_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id UUID; v_name TEXT;
BEGIN
  -- ---------------- Audit / Engagement Type ----------------
  IF TG_OP = 'INSERT'
     OR NEW.engagement_type_id IS DISTINCT FROM OLD.engagement_type_id
     OR NEW.engagement_type IS DISTINCT FROM OLD.engagement_type THEN

    IF NEW.engagement_type_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('AUDIT_TYPE', NEW.engagement_type_id);
    ELSIF NEW.engagement_type IS NOT NULL AND btrim(NEW.engagement_type) <> '' THEN
      v_id := public.ia_reference_resolve('AUDIT_TYPE', NEW.engagement_type);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active AUDIT_TYPE', NEW.engagement_type;
      END IF;
      NEW.engagement_type_id := v_id;
    END IF;

    IF NEW.engagement_type_id IS NOT NULL THEN
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.engagement_type_id;
      NEW.engagement_type := v_name;  -- text demoted to display snapshot
    END IF;
  END IF;

  -- ---------------- Coverage Category ----------------
  IF TG_OP = 'INSERT'
     OR NEW.coverage_category_id IS DISTINCT FROM OLD.coverage_category_id
     OR NEW.coverage_category IS DISTINCT FROM OLD.coverage_category THEN

    IF NEW.coverage_category_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('COVERAGE_CATEGORY', NEW.coverage_category_id);
    ELSIF NEW.coverage_category IS NOT NULL AND btrim(NEW.coverage_category) <> '' THEN
      IF public.ia_is_risk_band_label(NEW.coverage_category) THEN
        RAISE EXCEPTION 'IA_INVALID_REFERENCE_SEMANTICS: "%" is a risk classification, not a coverage category',
          NEW.coverage_category;
      END IF;
      v_id := public.ia_reference_resolve('COVERAGE_CATEGORY', NEW.coverage_category);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active COVERAGE_CATEGORY', NEW.coverage_category;
      END IF;
      NEW.coverage_category_id := v_id;
    END IF;

    IF NEW.coverage_category_id IS NOT NULL THEN
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.coverage_category_id;
      NEW.coverage_category := v_name;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_ia_engagement_reference_guard ON public.ia_audit_engagements;
CREATE TRIGGER zz_ia_engagement_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_audit_engagements
  FOR EACH ROW EXECUTE FUNCTION public.ia_engagement_reference_guard();

CREATE OR REPLACE FUNCTION public.ia_follow_up_reference_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id UUID; v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.follow_up_type_id IS DISTINCT FROM OLD.follow_up_type_id
     OR NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type THEN

    IF NEW.follow_up_type_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('FOLLOW_UP_TYPE', NEW.follow_up_type_id);
    ELSIF NEW.follow_up_type IS NOT NULL AND btrim(NEW.follow_up_type) <> '' THEN
      v_id := public.ia_reference_resolve('FOLLOW_UP_TYPE', NEW.follow_up_type);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active FOLLOW_UP_TYPE', NEW.follow_up_type;
      END IF;
      NEW.follow_up_type_id := v_id;
    END IF;

    IF NEW.follow_up_type_id IS NOT NULL THEN
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.follow_up_type_id;
      NEW.follow_up_type := v_name;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_ia_follow_up_reference_guard ON public.ia_follow_ups;
CREATE TRIGGER zz_ia_follow_up_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.ia_follow_up_reference_guard();

-- 8. Governed administration commands ---------------------------------------
CREATE OR REPLACE FUNCTION public.ia_reference_admin_can()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT public.ia_has('audit_configuration','configure');
$$;
GRANT EXECUTE ON FUNCTION public.ia_reference_admin_can() TO authenticated;

CREATE OR REPLACE FUNCTION public.ia_reference_value_create(
  _reference_type TEXT, _code TEXT, _name TEXT,
  _description TEXT DEFAULT NULL, _display_order INTEGER DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id UUID; v_actor UUID := auth.uid();
BEGIN
  IF NOT public.ia_reference_admin_can() THEN
    RAISE EXCEPTION 'IA_NOT_AUTHORIZED: audit_configuration.configure required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ia_reference_type WHERE code = _reference_type AND is_active) THEN
    RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE_TYPE: %', _reference_type;
  END IF;
  IF _code IS NULL OR btrim(_code) = '' OR _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'IA_INVALID_REFERENCE_INPUT: code and name are required';
  END IF;
  IF _reference_type = 'COVERAGE_CATEGORY' AND public.ia_is_risk_band_label(_name) THEN
    RAISE EXCEPTION 'IA_INVALID_REFERENCE_SEMANTICS: "%" is canonical risk vocabulary', _name;
  END IF;

  INSERT INTO public.ia_reference_value
    (reference_type, code, name, description, display_order, created_by, updated_by)
  VALUES (_reference_type, upper(btrim(_code)), btrim(_name), _description,
          COALESCE(_display_order,0), v_actor, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.ia_audit_event (event_code, entity_type, entity_id, actor_profile_id,
    actor_label, new_value, source_command)
  VALUES ('IA_REFERENCE_VALUE_CREATED','ia_reference_value', v_id, v_actor,
          public.ia_actor_label(),
          jsonb_build_object('reference_type',_reference_type,'code',upper(btrim(_code)),'name',btrim(_name)),
          'ia_reference_value_create');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ia_reference_value_update(
  _id UUID, _name TEXT DEFAULT NULL, _description TEXT DEFAULT NULL,
  _display_order INTEGER DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old public.ia_reference_value%ROWTYPE; v_actor UUID := auth.uid();
BEGIN
  IF NOT public.ia_reference_admin_can() THEN
    RAISE EXCEPTION 'IA_NOT_AUTHORIZED: audit_configuration.configure required';
  END IF;
  SELECT * INTO v_old FROM public.ia_reference_value WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: %', _id; END IF;
  IF v_old.reference_type = 'COVERAGE_CATEGORY' AND _name IS NOT NULL
     AND public.ia_is_risk_band_label(_name) THEN
    RAISE EXCEPTION 'IA_INVALID_REFERENCE_SEMANTICS: "%" is canonical risk vocabulary', _name;
  END IF;

  UPDATE public.ia_reference_value SET
    name          = COALESCE(NULLIF(btrim(_name),''), name),
    description   = COALESCE(_description, description),
    display_order = COALESCE(_display_order, display_order),
    updated_at    = now(),
    updated_by    = v_actor
  WHERE id = _id;

  INSERT INTO public.ia_audit_event (event_code, entity_type, entity_id, actor_profile_id,
    actor_label, old_value, new_value, source_command)
  VALUES ('IA_REFERENCE_VALUE_UPDATED','ia_reference_value', _id, v_actor, public.ia_actor_label(),
          jsonb_build_object('name',v_old.name,'description',v_old.description,'display_order',v_old.display_order),
          jsonb_build_object('name',COALESCE(NULLIF(btrim(_name),''),v_old.name),'description',COALESCE(_description,v_old.description),'display_order',COALESCE(_display_order,v_old.display_order)),
          'ia_reference_value_update');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.ia_reference_value_set_active(
  _id UUID, _is_active BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old public.ia_reference_value%ROWTYPE; v_actor UUID := auth.uid();
BEGIN
  IF NOT public.ia_reference_admin_can() THEN
    RAISE EXCEPTION 'IA_NOT_AUTHORIZED: audit_configuration.configure required';
  END IF;
  SELECT * INTO v_old FROM public.ia_reference_value WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: %', _id; END IF;

  UPDATE public.ia_reference_value SET
    is_active      = _is_active,
    deactivated_at = CASE WHEN _is_active THEN NULL ELSE now() END,
    deactivated_by = CASE WHEN _is_active THEN NULL ELSE v_actor END,
    updated_at     = now(),
    updated_by     = v_actor
  WHERE id = _id;

  INSERT INTO public.ia_audit_event (event_code, entity_type, entity_id, actor_profile_id,
    actor_label, old_value, new_value, reason, source_command)
  VALUES (CASE WHEN _is_active THEN 'IA_REFERENCE_VALUE_ACTIVATED' ELSE 'IA_REFERENCE_VALUE_DEACTIVATED' END,
          'ia_reference_value', _id, v_actor, public.ia_actor_label(),
          jsonb_build_object('is_active', v_old.is_active),
          jsonb_build_object('is_active', _is_active), _reason,
          'ia_reference_value_set_active');
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.ia_reference_value_create(TEXT,TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ia_reference_value_update(UUID,TEXT,TEXT,INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ia_reference_value_set_active(UUID,BOOLEAN,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_reference_value_create(TEXT,TEXT,TEXT,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_reference_value_update(UUID,TEXT,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_reference_value_set_active(UUID,BOOLEAN,TEXT) TO authenticated;

-- 9. Historical reconciliation map (no silent coercion) ----------------------
CREATE TABLE IF NOT EXISTS public.ia_reference_migration_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type  TEXT NOT NULL,
  legacy_value    TEXT,
  classification  TEXT NOT NULL,   -- EXACT_CANONICAL | DETERMINISTIC_SYNONYM | HISTORICAL_RETAINED | SEMANTICALLY_INVALID | REQUIRES_BUSINESS_DECISION | MISSING
  canonical_code  TEXT,
  rows_affected   INTEGER NOT NULL DEFAULT 0,
  rationale       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ia_reference_migration_map TO authenticated;
GRANT ALL ON public.ia_reference_migration_map TO service_role;
ALTER TABLE public.ia_reference_migration_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_reference_migration_map_read ON public.ia_reference_migration_map;
CREATE POLICY ia_reference_migration_map_read ON public.ia_reference_migration_map
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

TRUNCATE public.ia_reference_migration_map;

INSERT INTO public.ia_reference_migration_map (reference_type, legacy_value, classification, canonical_code, rows_affected, rationale)
SELECT 'AUDIT_TYPE', e.engagement_type,
       CASE WHEN r.id IS NULL THEN 'REQUIRES_BUSINESS_DECISION'
            WHEN lower(r.name) = lower(btrim(e.engagement_type)) THEN 'EXACT_CANONICAL'
            ELSE 'DETERMINISTIC_SYNONYM' END,
       r.code, count(*)::int,
       'Stage 2B reconciliation of live ia_audit_engagements.engagement_type'
FROM public.ia_audit_engagements e
LEFT JOIN public.ia_reference_value r
  ON r.reference_type='AUDIT_TYPE' AND lower(r.name)=lower(btrim(e.engagement_type))
WHERE e.engagement_type IS NOT NULL
GROUP BY e.engagement_type, r.id, r.name, r.code;

INSERT INTO public.ia_reference_migration_map (reference_type, legacy_value, classification, canonical_code, rows_affected, rationale)
SELECT 'COVERAGE_CATEGORY', e.coverage_category,
       CASE WHEN e.coverage_category IS NULL THEN 'MISSING'
            WHEN public.ia_is_risk_band_label(e.coverage_category) THEN 'SEMANTICALLY_INVALID'
            WHEN r.id IS NOT NULL THEN 'EXACT_CANONICAL'
            ELSE 'REQUIRES_BUSINESS_DECISION' END,
       r.code, count(*)::int,
       CASE WHEN public.ia_is_risk_band_label(e.coverage_category)
            THEN 'Risk classification stored in coverage column (DEF-E2E-008) — NOT mapped, historical value preserved'
            ELSE 'Stage 2B reconciliation of live ia_audit_engagements.coverage_category' END
FROM public.ia_audit_engagements e
LEFT JOIN public.ia_reference_value r
  ON r.reference_type='COVERAGE_CATEGORY' AND lower(r.name)=lower(btrim(e.coverage_category))
GROUP BY e.coverage_category, r.id, r.code;

INSERT INTO public.ia_reference_migration_map (reference_type, legacy_value, classification, canonical_code, rows_affected, rationale)
SELECT 'FOLLOW_UP_TYPE', f.follow_up_type,
       CASE WHEN f.follow_up_type IS NULL THEN 'MISSING'
            WHEN r.id IS NOT NULL THEN 'EXACT_CANONICAL'
            ELSE 'HISTORICAL_RETAINED' END,
       r.code, count(*)::int,
       'Stage 2B reconciliation of live ia_follow_ups.follow_up_type'
FROM public.ia_follow_ups f
LEFT JOIN public.ia_reference_value r
  ON r.reference_type='FOLLOW_UP_TYPE'
 AND (lower(r.name)=lower(btrim(f.follow_up_type)) OR upper(r.code)=upper(btrim(f.follow_up_type)))
GROUP BY f.follow_up_type, r.id, r.code;

-- 10. Additive backfill: ONLY provable mappings, text left untouched ---------
UPDATE public.ia_audit_engagements e
   SET engagement_type_id = r.id
  FROM public.ia_reference_value r
 WHERE r.reference_type='AUDIT_TYPE'
   AND lower(r.name)=lower(btrim(e.engagement_type))
   AND e.engagement_type_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ia_annual_plans p
                    WHERE p.id = e.annual_plan_id AND lower(p.status) = 'closed');

UPDATE public.ia_audit_engagements e
   SET coverage_category_id = r.id
  FROM public.ia_reference_value r
 WHERE r.reference_type='COVERAGE_CATEGORY'
   AND lower(r.name)=lower(btrim(e.coverage_category))
   AND NOT public.ia_is_risk_band_label(e.coverage_category)
   AND e.coverage_category_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ia_annual_plans p
                    WHERE p.id = e.annual_plan_id AND lower(p.status) = 'closed');

UPDATE public.ia_follow_ups f
   SET follow_up_type_id = r.id
  FROM public.ia_reference_value r
 WHERE r.reference_type='FOLLOW_UP_TYPE'
   AND (lower(r.name)=lower(btrim(f.follow_up_type)) OR upper(r.code)=upper(btrim(f.follow_up_type)))
   AND f.follow_up_type_id IS NULL;

-- 11. Configuration health for reference masters -----------------------------
CREATE OR REPLACE FUNCTION public.ia_reference_configuration_health()
RETURNS TABLE(check_code TEXT, severity TEXT, affected_count BIGINT, detail TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT 'REF_TYPE_WITHOUT_ACTIVE_VALUE','HIGH', count(*)::bigint,
         'Reference types with no active value'
    FROM public.ia_reference_type t
   WHERE t.is_active AND NOT EXISTS (
     SELECT 1 FROM public.ia_reference_value v WHERE v.reference_type=t.code AND v.is_active)
  UNION ALL
  SELECT 'ENGAGEMENT_WITHOUT_AUDIT_TYPE_ID','HIGH', count(*)::bigint,
         'Engagements without a canonical audit type reference'
    FROM public.ia_audit_engagements WHERE engagement_type_id IS NULL
  UNION ALL
  SELECT 'COVERAGE_POLLUTED_WITH_RISK_BAND','HIGH', count(*)::bigint,
         'Historical engagements holding a risk band in coverage_category (DEF-E2E-008 legacy residue)'
    FROM public.ia_audit_engagements WHERE public.ia_is_risk_band_label(coverage_category)
  UNION ALL
  SELECT 'COVERAGE_WITHOUT_CATEGORY_ID','MEDIUM', count(*)::bigint,
         'Engagements without a canonical coverage category reference'
    FROM public.ia_audit_engagements WHERE coverage_category_id IS NULL
  UNION ALL
  SELECT 'FOLLOW_UP_WITHOUT_TYPE_ID','MEDIUM', count(*)::bigint,
         'Follow-ups without a canonical follow-up type reference'
    FROM public.ia_follow_ups WHERE follow_up_type_id IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.ia_reference_configuration_health() TO authenticated;