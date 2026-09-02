-- Stage 2D (DEF-E2E-011): Department / Function referential integrity for IA engagements.
-- FK enforcement for existence already exists (ia_audit_engagements_department_id_fkey /
-- _function_id_fkey). This adds the two things an FK cannot prove:
--   (a) the Function actually belongs to the engagement's Department;
--   (b) inactive organisational references cannot be used for NEW work.
-- Historical rows are never re-validated: on UPDATE the guard only fires when
-- department_id or function_id actually changes.

CREATE OR REPLACE FUNCTION public.ia_engagement_org_ref_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept_active boolean;
  v_fn_active   boolean;
  v_fn_dept     uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id
     AND NEW.function_id   IS NOT DISTINCT FROM OLD.function_id THEN
    RETURN NEW;
  END IF;

  IF NEW.department_id IS NOT NULL THEN
    SELECT d.is_active INTO v_dept_active FROM ia_departments d WHERE d.id = NEW.department_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'IA_UNKNOWN_DEPARTMENT: department % does not exist', NEW.department_id
        USING ERRCODE = 'P0001';
    END IF;
    IF v_dept_active IS NOT TRUE THEN
      RAISE EXCEPTION 'IA_INACTIVE_DEPARTMENT: department % is inactive and cannot be used for new work', NEW.department_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.function_id IS NOT NULL THEN
    SELECT f.is_active, f.department_id INTO v_fn_active, v_fn_dept
    FROM ia_department_functions f WHERE f.id = NEW.function_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'IA_UNKNOWN_FUNCTION: function % does not exist', NEW.function_id
        USING ERRCODE = 'P0001';
    END IF;
    IF v_fn_active IS NOT TRUE THEN
      RAISE EXCEPTION 'IA_INACTIVE_FUNCTION: function % is inactive and cannot be used for new work', NEW.function_id
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.department_id IS NULL THEN
      RAISE EXCEPTION 'IA_INVALID_FUNCTION_PARENT: a function cannot be selected without its parent department'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_fn_dept IS DISTINCT FROM NEW.department_id THEN
      RAISE EXCEPTION 'IA_INVALID_FUNCTION_PARENT: function % belongs to department %, not %', NEW.function_id, v_fn_dept, NEW.department_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ia_engagement_org_ref_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_ia_engagement_org_ref_guard ON public.ia_audit_engagements;
CREATE TRIGGER zz_ia_engagement_org_ref_guard
BEFORE INSERT OR UPDATE OF department_id, function_id ON public.ia_audit_engagements
FOR EACH ROW EXECUTE FUNCTION public.ia_engagement_org_ref_guard();