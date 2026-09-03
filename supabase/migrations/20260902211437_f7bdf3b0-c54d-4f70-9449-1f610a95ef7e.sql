-- Stage 2E: governed workflow vocabulary guards (DEF-E2E-012)
CREATE OR REPLACE FUNCTION public.ia_workflow_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_changed boolean := false;
BEGIN
  -- Governed commands are SECURITY DEFINER owned by postgres; only direct
  -- client (PostgREST) writes execute as anon/authenticated.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ia_audit_engagements' THEN
    v_changed := (NEW.status IS DISTINCT FROM OLD.status)
              OR (NEW.execution_status IS DISTINCT FROM OLD.execution_status);
  ELSIF TG_TABLE_NAME = 'ia_findings' THEN
    v_changed := (NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status);
  ELSIF TG_TABLE_NAME = 'ia_action_tracking' THEN
    v_changed := (NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status)
              OR (NEW.status IS DISTINCT FROM OLD.status);
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'IA_USE_GOVERNED_COMMAND: workflow status on % must be changed through a governed audit command', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_audit_engagements;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_audit_engagements
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_findings;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_findings
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_action_tracking;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_action_tracking
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

REVOKE EXECUTE ON FUNCTION public.ia_workflow_status_guard() FROM PUBLIC, anon, authenticated;
