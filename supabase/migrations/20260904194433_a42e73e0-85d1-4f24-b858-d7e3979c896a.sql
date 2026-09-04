-- PART 3 — generation as governed Draft, separate issue/seal authority.

CREATE OR REPLACE FUNCTION public.ia_generate_management_status_report(
  p_plan_id uuid, p_audience text DEFAULT 'HIA', p_reporting_period text DEFAULT NULL,
  p_as_at timestamptz DEFAULT now(), p_department_id uuid DEFAULT NULL,
  p_compare_report_id uuid DEFAULT NULL, p_period_code text DEFAULT 'CURRENT',
  p_period_start date DEFAULT NULL, p_period_end date DEFAULT NULL,
  p_report_mode text DEFAULT 'Detailed Management Report')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_live jsonb; v_prev public.ia_management_status_report%ROWTYPE; v_cmp jsonb := NULL;
  v_row public.ia_management_status_report%ROWTYPE;
  v_plan public.ia_annual_plans%ROWTYPE;
  v_def public.ia_report_definition%ROWTYPE;
  v_prov jsonb; v_ev int;
BEGIN
  IF NOT public.ia_can_generate_management_report(p_plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;

  v_live := public.ia_management_status_live_v2(p_plan_id, p_as_at, p_audience, p_department_id,
                                                p_period_code, p_period_start, p_period_end);
  IF NOT COALESCE((v_live ->> 'ok')::boolean, false) THEN RETURN v_live; END IF;
  v_live := v_live || jsonb_build_object('report_mode', p_report_mode);

  SELECT * INTO v_plan FROM public.ia_annual_plans WHERE id = p_plan_id;

  SELECT * INTO v_def FROM public.ia_report_definition
   WHERE is_active AND (report_name = p_report_mode OR report_code = p_report_mode)
   ORDER BY display_order LIMIT 1;
  IF v_def.id IS NULL THEN
    SELECT * INTO v_def FROM public.ia_report_definition
     WHERE is_active AND audience_code = p_audience ORDER BY display_order LIMIT 1;
  END IF;

  IF v_def.id IS NOT NULL AND v_def.permitted_scope = 'DEPARTMENT' AND p_department_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'department_scope_required');
  END IF;

  v_prov := jsonb_build_object(
    'report_definition_code', v_def.report_code,
    'report_definition_version', v_def.version_number,
    'template_type', v_def.template_type,
    'document_classification', v_def.document_classification,
    'distribution_policy', v_def.distribution_policy,
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section_key', s.section_key, 'heading', s.heading, 'sort_order', s.sort_order,
        'is_visible', s.is_visible, 'display_mode', s.display_mode,
        'start_on_new_page', s.start_on_new_page, 'is_appendix', s.is_appendix)
        ORDER BY s.sort_order)
      FROM public.ia_report_definition_section s WHERE s.definition_id = v_def.id), '[]'::jsonb),
    'metrics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('metric_code', m.metric_code, 'label', m.label,
             'formatter', m.formatter, 'source_path', m.source_path, 'display_order', m.display_order)
             ORDER BY m.display_order)
      FROM public.ia_report_metric m
      WHERE m.is_enabled AND (v_def.metrics = '{}' OR m.metric_code = ANY (v_def.metrics))), '[]'::jsonb),
    'progress_methodology', public.ia_report_methodology_active('PROGRESS') - 'config',
    'schedule_methodology', public.ia_report_methodology_active('SCHEDULE') - 'config',
    'health_methodology', public.ia_report_methodology_active('PLAN_HEALTH') - 'config',
    'fiscal_period', v_live -> 'period',
    'plan_version', COALESCE(v_plan.current_version_number, 1),
    'organisation_country', public.ia_org_country_code(),
    'generated_at', now(), 'status_as_at', p_as_at);

  v_live := v_live || jsonb_build_object('provenance', COALESCE(v_live -> 'provenance', '{}'::jsonb) || v_prov);

  IF p_compare_report_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ia_management_status_report WHERE id = p_compare_report_id;
  ELSE
    SELECT * INTO v_prev FROM public.ia_management_status_report
     WHERE plan_id = p_plan_id AND audience = p_audience AND lifecycle_state = 'Issued'
       AND department_id IS NOT DISTINCT FROM p_department_id
     ORDER BY status_as_at DESC LIMIT 1;
  END IF;

  IF v_prev.id IS NOT NULL THEN
    WITH cur AS (SELECT e ->> 'engagement_id' id, e FROM jsonb_array_elements(v_live -> 'engagements') e),
         prv AS (SELECT e ->> 'engagement_id' id, e FROM jsonb_array_elements(v_prev.snapshot -> 'engagements') e)
    SELECT jsonb_build_object(
      'previous_report_number', v_prev.report_number,
      'previous_as_at', v_prev.status_as_at,
      'engagements_closed', count(*) FILTER (
        WHERE cur.e ->> 'lifecycle_status' ILIKE 'Closed%' AND COALESCE(prv.e ->> 'lifecycle_status','') NOT ILIKE 'Closed%'),
      'new_delays', count(*) FILTER (
        WHERE cur.e ->> 'schedule_health' = 'Delayed' AND COALESCE(prv.e ->> 'schedule_health','') <> 'Delayed'),
      'newly_cancelled', count(*) FILTER (
        WHERE cur.e ->> 'lifecycle_status' ILIKE 'Cancelled%' AND COALESCE(prv.e ->> 'lifecycle_status','') NOT ILIKE 'Cancelled%'),
      'newly_carried_forward', count(*) FILTER (
        WHERE cur.e ->> 'lifecycle_status' ILIKE 'Carried Forward%' AND COALESCE(prv.e ->> 'lifecycle_status','') NOT ILIKE 'Carried Forward%'),
      'rescheduled', count(*) FILTER (
        WHERE prv.e IS NOT NULL AND (cur.e ->> 'planned_end') IS DISTINCT FROM (prv.e ->> 'planned_end')),
      'opinion_changes', COALESCE(jsonb_agg(jsonb_build_object(
          'engagement_code', cur.e ->> 'engagement_code',
          'from', prv.e ->> 'audit_opinion', 'to', cur.e ->> 'audit_opinion')) FILTER (
        WHERE prv.e IS NOT NULL AND (cur.e ->> 'audit_opinion') IS DISTINCT FROM (prv.e ->> 'audit_opinion')), '[]'::jsonb),
      'new_critical_high_findings',
        GREATEST(0, COALESCE((v_live -> 'kpis' ->> 'findings_critical_high_open')::int, 0)
                  - COALESCE((v_prev.snapshot -> 'kpis' ->> 'findings_critical_high_open')::int, 0)),
      'significant_findings_closed',
        GREATEST(0, COALESCE((v_prev.snapshot -> 'kpis' ->> 'findings_critical_high_open')::int, 0)
                  - COALESCE((v_live -> 'kpis' ->> 'findings_critical_high_open')::int, 0)),
      'actions_newly_overdue',
        GREATEST(0, COALESCE((v_live -> 'actions' ->> 'overdue')::int, 0)
                  - COALESCE((v_prev.snapshot -> 'actions' ->> 'overdue')::int, 0)),
      'actions_closed',
        GREATEST(0, COALESCE((v_live -> 'actions' ->> 'verified')::int, 0)
                  - COALESCE((v_prev.snapshot -> 'actions' ->> 'verified')::int, 0)),
      'plan_amendments',
        GREATEST(0, jsonb_array_length(v_live -> 'plan_changes' -> 'amendments')
                  - COALESCE(jsonb_array_length(v_prev.snapshot -> 'plan_changes' -> 'amendments'), 0)),
      'plan_completion_delta',
        COALESCE((v_live -> 'kpis' ->> 'plan_completion_pct')::int, 0)
          - COALESCE((v_prev.snapshot -> 'kpis' ->> 'plan_completion_pct')::int, 0),
      'methodology_changed',
        (v_prev.config_provenance -> 'health_methodology' ->> 'version')
          IS DISTINCT FROM (v_prov -> 'health_methodology' ->> 'version')
        OR (v_prev.config_provenance -> 'progress_methodology' ->> 'version')
          IS DISTINCT FROM (v_prov -> 'progress_methodology' ->> 'version')
    ) INTO v_cmp
    FROM cur LEFT JOIN prv ON prv.id = cur.id;
  END IF;

  -- Drafts do not consume an authoritative report number; it is allocated at issue.
  PERFORM set_config('ia.allow_code_override', 'on', true);
  INSERT INTO public.ia_management_status_report (
    report_number, plan_id, plan_version_number, fiscal_year, reporting_period, status_as_at,
    audience, department_id, snapshot, comparison_report_id, comparison, generated_by,
    config_provenance, status, lifecycle_state
  ) VALUES (
    'IA-MSR-DRAFT-' || substr(replace(gen_random_uuid()::text,'-',''), 1, 10),
    p_plan_id, COALESCE(v_plan.current_version_number, 1), v_plan.fiscal_year,
    COALESCE(p_reporting_period, v_live -> 'period' ->> 'label'), p_as_at,
    p_audience, p_department_id, v_live, v_prev.id, v_cmp,
    COALESCE(auth.jwt() ->> 'email', auth.uid()::text), v_prov, 'Draft', 'Draft'
  ) RETURNING * INTO v_row;
  PERFORM set_config('ia.allow_code_override', 'off', true);

  v_ev := public.ia_msr_capture_evidence(v_row.id);

  RETURN jsonb_build_object('ok', true, 'report_id', v_row.id, 'report_number', v_row.report_number,
                            'lifecycle_state', v_row.lifecycle_state, 'evidence_rows', v_ev);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ia_issue_management_status_report(
  p_report_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_r public.ia_management_status_report%ROWTYPE;
  v_num record; v_country text := public.ia_org_country_code();
BEGIN
  SELECT * INTO v_r FROM public.ia_management_status_report WHERE id = p_report_id;
  IF v_r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code','report_not_found'); END IF;
  IF NOT public.ia_can_issue_management_report(v_r.plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code','not_authorised');
  END IF;
  IF v_r.lifecycle_state = 'Issued' THEN
    RETURN jsonb_build_object('ok', true, 'code','already_issued',
                              'report_number', v_r.report_number);
  END IF;

  SELECT * INTO v_num FROM public.core_generate_number(
    'INTERNAL_AUDIT', 'MANAGEMENT_STATUS_REPORT', v_country, NULL, NULL, NULL);
  IF v_num.generated_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','numbering_unavailable');
  END IF;

  PERFORM set_config('ia.allow_code_override', 'on', true);
  UPDATE public.ia_management_status_report
     SET report_number = v_num.generated_number,
         lifecycle_state = 'Issued', status = 'Sealed',
         issued_at = now(),
         issued_by = COALESCE(auth.jwt() ->> 'email', auth.uid()::text),
         issue_note = p_note
   WHERE id = p_report_id
   RETURNING * INTO v_r;
  PERFORM set_config('ia.allow_code_override', 'off', true);

  INSERT INTO public.ia_audit_event (event_code, entity_type, entity_id, annual_plan_id,
                                     actor_label, occurred_at, new_value, reason, source_command)
  VALUES ('IA.REPORT.ISSUED', 'management_status_report', v_r.id, v_r.plan_id,
          COALESCE(auth.jwt() ->> 'email', auth.uid()::text), now(),
          jsonb_build_object('report_number', v_r.report_number, 'audience', v_r.audience),
          p_note, 'ia_issue_management_status_report');

  RETURN jsonb_build_object('ok', true, 'report_id', v_r.id, 'report_number', v_r.report_number,
                            'lifecycle_state', v_r.lifecycle_state);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ia_issue_management_status_report(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_can_generate_management_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_can_issue_management_report(uuid) TO authenticated;