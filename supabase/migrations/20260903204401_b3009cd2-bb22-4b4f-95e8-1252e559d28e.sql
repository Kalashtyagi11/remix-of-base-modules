-- Archive stores for immutable IA evidence that would otherwise be cascade-deleted
CREATE TABLE IF NOT EXISTS public.ia_archive_engagement_execution_log (LIKE public.ia_engagement_execution_log INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS public.ia_archive_plan_change_log (LIKE public.ia_plan_change_log INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS public.ia_archive_report_versions (LIKE public.ia_report_versions INCLUDING DEFAULTS);

ALTER TABLE public.ia_archive_engagement_execution_log ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ia_archive_plan_change_log ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ia_archive_report_versions ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT ON public.ia_archive_engagement_execution_log TO authenticated;
GRANT SELECT ON public.ia_archive_plan_change_log TO authenticated;
GRANT SELECT ON public.ia_archive_report_versions TO authenticated;
GRANT ALL ON public.ia_archive_engagement_execution_log TO service_role;
GRANT ALL ON public.ia_archive_plan_change_log TO service_role;
GRANT ALL ON public.ia_archive_report_versions TO service_role;

ALTER TABLE public.ia_archive_engagement_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_archive_plan_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_archive_report_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_archive_eel_read ON public.ia_archive_engagement_execution_log;
CREATE POLICY ia_archive_eel_read ON public.ia_archive_engagement_execution_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ia_archive_pcl_read ON public.ia_archive_plan_change_log;
CREATE POLICY ia_archive_pcl_read ON public.ia_archive_plan_change_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ia_archive_rv_read ON public.ia_archive_report_versions;
CREATE POLICY ia_archive_rv_read ON public.ia_archive_report_versions FOR SELECT TO authenticated USING (true);

-- Controlled TEST-estate purge: archives immutable evidence, then removes
-- transactional IA records in dependency order. Master/reference/configuration
-- and central numbering counters are never touched.
CREATE OR REPLACE FUNCTION public.ia_test_estate_purge(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_arch_eel int; v_arch_pcl int; v_arch_rv int;
  t text;
BEGIN
  IF p_confirm IS DISTINCT FROM 'IA-50E2E-20260904-RESET' THEN
    RAISE EXCEPTION 'IA_PURGE_NOT_CONFIRMED';
  END IF;

  SELECT jsonb_build_object(
    'plans', (SELECT count(*) FROM ia_annual_plans),
    'engagements', (SELECT count(*) FROM ia_audit_engagements),
    'findings', (SELECT count(*) FROM ia_findings),
    'audit_event', (SELECT count(*) FROM ia_audit_event)
  ) INTO v_before;

  INSERT INTO ia_archive_engagement_execution_log
    SELECT l.*, now() FROM ia_engagement_execution_log l;
  GET DIAGNOSTICS v_arch_eel = ROW_COUNT;
  INSERT INTO ia_archive_plan_change_log
    SELECT l.*, now() FROM ia_plan_change_log l;
  GET DIAGNOSTICS v_arch_pcl = ROW_COUNT;
  INSERT INTO ia_archive_report_versions
    SELECT r.*, now() FROM ia_report_versions r;
  GET DIAGNOSTICS v_arch_rv = ROW_COUNT;

  -- scoped, transaction-local suspension of row guards on the purge targets only
  FOREACH t IN ARRAY ARRAY[
    'ia_annual_plans','ia_audit_engagements','ia_report_versions',
    'ia_audit_reports','ia_findings','ia_risk_assessments','ia_department_audits'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
  END LOOP;

  -- level 3 / 2 children
  DELETE FROM ia_action_plan_milestones;
  DELETE FROM ia_action_plan_updates;
  DELETE FROM ia_action_progress_log;
  DELETE FROM ia_action_extensions;
  DELETE FROM ia_control_test_results;
  DELETE FROM ia_finding_severity_history;
  DELETE FROM ia_quality_review_checklist;
  DELETE FROM ia_recommendations;
  DELETE FROM ia_report_versions;

  -- level 1 children (NO ACTION FKs must be cleared explicitly)
  DELETE FROM ia_prior_action_reference;
  DELETE FROM ia_follow_ups;
  DELETE FROM ia_action_tracking;
  DELETE FROM ia_management_responses;
  DELETE FROM ia_evidence;
  DELETE FROM ia_working_papers;
  DELETE FROM ia_findings;
  DELETE FROM ia_control_tests;
  DELETE FROM ia_activities;
  DELETE FROM ia_quality_reviews;
  DELETE FROM ia_audit_closure;
  DELETE FROM ia_audit_reports;
  DELETE FROM ia_audit_queries;
  DELETE FROM ia_audit_checklists;
  DELETE FROM ia_time_logs;
  DELETE FROM ia_preparation_documents;
  DELETE FROM ia_preparation_checklists;
  DELETE FROM ia_document_requests;
  DELETE FROM ia_communications;
  DELETE FROM ia_communication_stages;
  DELETE FROM ia_engagement_schedule_history;
  DELETE FROM ia_engagement_risk_overrides;
  DELETE FROM ia_engagement_execution_log;
  DELETE FROM ia_availability_conflicts;
  DELETE FROM ia_plan_carry_forward;

  -- ownership-by-column transactional tables
  DELETE FROM ia_auto_notification_log;
  DELETE FROM ia_comms_reminder_run_log;
  DELETE FROM ia_auto_plan_candidates;
  DELETE FROM ia_planning_score_explanations;
  DELETE FROM ia_planning_assumptions;
  DELETE FROM ia_planning_wizard_state;
  DELETE FROM ia_resource_recommendations;
  DELETE FROM ia_plan_version_engagements;
  DELETE FROM ia_plan_versions;
  DELETE FROM ia_plan_amendments;
  DELETE FROM ia_plan_artifacts;
  DELETE FROM ia_plan_distribution_logs;
  DELETE FROM ia_plan_change_log;
  DELETE FROM ia_audit_plan_functions;
  DELETE FROM ia_fiscal_year_migration_map;
  DELETE FROM ia_department_audits;

  -- roots
  DELETE FROM ia_audit_engagements;
  DELETE FROM ia_annual_plans;

  FOREACH t IN ARRAY ARRAY[
    'ia_annual_plans','ia_audit_engagements','ia_report_versions',
    'ia_audit_reports','ia_findings','ia_risk_assessments','ia_department_audits'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;

  SELECT jsonb_build_object(
    'plans', (SELECT count(*) FROM ia_annual_plans),
    'engagements', (SELECT count(*) FROM ia_audit_engagements),
    'findings', (SELECT count(*) FROM ia_findings),
    'audit_event_preserved', (SELECT count(*) FROM ia_audit_event)
  ) INTO v_after;

  RETURN jsonb_build_object(
    'success', true,
    'before', v_before,
    'after', v_after,
    'archived', jsonb_build_object(
      'execution_log', v_arch_eel,
      'plan_change_log', v_arch_pcl,
      'report_versions', v_arch_rv
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_test_estate_purge(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_test_estate_purge(text) TO service_role;