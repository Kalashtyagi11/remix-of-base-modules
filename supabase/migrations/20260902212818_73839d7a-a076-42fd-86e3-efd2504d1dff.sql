-- Stage 2E (DEF-E2E-012) — extend the governed workflow status guard to the
-- remaining Internal Audit workflow-bearing objects (annual plans, follow-ups,
-- reports, quality reviews). Additive and idempotent; no historical data changes.
CREATE OR REPLACE FUNCTION public.ia_workflow_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  ELSIF TG_TABLE_NAME = 'ia_annual_plans' THEN
    v_changed := (NEW.status IS DISTINCT FROM OLD.status);
  ELSIF TG_TABLE_NAME = 'ia_follow_ups' THEN
    v_changed := (NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status)
              OR (NEW.status IS DISTINCT FROM OLD.status)
              OR (NEW.outcome IS DISTINCT FROM OLD.outcome);
  ELSIF TG_TABLE_NAME = 'ia_audit_reports' THEN
    v_changed := (NEW.status IS DISTINCT FROM OLD.status);
  ELSIF TG_TABLE_NAME = 'ia_quality_reviews' THEN
    v_changed := (NEW.status IS DISTINCT FROM OLD.status);
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'IA_USE_GOVERNED_COMMAND: workflow status on % must be changed through a governed audit command', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_annual_plans;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_annual_plans
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_follow_ups;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_audit_reports;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_audit_reports
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

DROP TRIGGER IF EXISTS zz_ia_workflow_status_guard ON public.ia_quality_reviews;
CREATE TRIGGER zz_ia_workflow_status_guard
  BEFORE UPDATE ON public.ia_quality_reviews
  FOR EACH ROW EXECUTE FUNCTION public.ia_workflow_status_guard();

REVOKE EXECUTE ON FUNCTION public.ia_workflow_status_guard() FROM PUBLIC, anon, authenticated;