CREATE OR REPLACE FUNCTION public.ia_issue_report(p_report_id uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rep record; v_actor text := public.ia_actor_label(); v_gate jsonb;
  v_qa record; v_version record;
BEGIN
  SELECT * INTO v_rep FROM public.ia_audit_reports WHERE id = p_report_id;
  IF v_rep IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'IA_NOT_FOUND', 'error', 'Report not found'); END IF;
  IF NOT public.ia_cmd_guard_elevated('audit_reports', 'approve', v_rep.engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN', 'error', 'You do not have permission to issue audit reports');
  END IF;
  IF v_rep.issued_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_ALREADY_ISSUED', 'error', 'This report has already been issued');
  END IF;

  -- Segregation of duties: the preparer of a report cannot issue it.
  IF COALESCE(NULLIF(trim(v_rep.prepared_by), ''), NULLIF(trim(v_rep.created_by), '')) = v_actor THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_SOD_VIOLATION',
      'error', 'The officer who prepared this report cannot issue it; issuance requires a second authorised officer');
  END IF;

  SELECT * INTO v_version FROM public.ia_report_versions
   WHERE report_id = p_report_id ORDER BY version_number DESC LIMIT 1;
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_NO_VERSION', 'error', 'Create a report version before issuing the report');
  END IF;

  SELECT * INTO v_qa FROM public.ia_quality_reviews
   WHERE engagement_id = v_rep.engagement_id AND status = 'Cleared'
   ORDER BY cleared_at DESC NULLS LAST LIMIT 1;
  IF v_qa IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_QA_NOT_CLEARED',
      'error', 'Quality assurance must be cleared before the report can be issued');
  END IF;

  v_gate := public.ia_can_issue_report(p_report_id);
  IF NOT COALESCE((v_gate->>'can_issue')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_GATE_BLOCKED', 'error', 'Report issuance gate not satisfied', 'gate', v_gate);
  END IF;

  UPDATE public.ia_report_versions
     SET status = 'Issued', is_issued = true, issued_at = now(), issued_by = v_actor, updated_by = v_actor
   WHERE id = v_version.id;

  UPDATE public.ia_audit_reports
     SET status = 'Issued', issued_at = now(), issued_by = v_actor,
         qa_review_id = v_qa.id, approved_by = COALESCE(approved_by, v_actor), approved_on = now(),
         updated_at = now(), updated_by = v_actor
   WHERE id = p_report_id;

  PERFORM public.ia_log_event('IA.REPORT.ISSUED', 'audit_report', p_report_id, v_rep.engagement_id, v_rep.plan_id,
    jsonb_build_object('status', v_rep.status),
    jsonb_build_object('status', 'Issued', 'version_number', v_version.version_number, 'qa_review_id', v_qa.id),
    p_notes, NULL, 'ia_issue_report');

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'version_number', v_version.version_number);
END;
$$;