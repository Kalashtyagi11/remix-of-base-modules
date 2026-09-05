-- PART 2 — lineage corrections, honest denominators, universe coverage,
-- draft/issue lifecycle and sealed evidence capture.

CREATE OR REPLACE FUNCTION public.ia_management_status_live_v2(
  p_plan_id uuid, p_as_at timestamptz DEFAULT now(), p_audience text DEFAULT 'HIA',
  p_department_id uuid DEFAULT NULL, p_period_code text DEFAULT 'CURRENT',
  p_period_start date DEFAULT NULL, p_period_end date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_base jsonb; v_per jsonb; v_s date; v_e date;
  v_move jsonb; v_completed jsonb; v_themes jsonb; v_cov jsonb; v_fc jsonb;
  v_rows jsonb; v_n int; v_kpi jsonb; v_den jsonb;
BEGIN
  v_base := public.ia_management_status_live(p_plan_id, p_as_at, p_audience, p_department_id);
  IF NOT COALESCE((v_base ->> 'ok')::boolean, false) THEN RETURN v_base; END IF;

  v_per := public.ia_management_period_bounds(p_plan_id, p_period_code, p_period_start, p_period_end, p_as_at);
  v_s := (v_per ->> 'start')::date;
  v_e := (v_per ->> 'end')::date;
  v_rows := v_base -> 'engagements';
  v_n := jsonb_array_length(v_rows);

  -- Honest denominators: never present a percentage when nothing is in scope.
  v_kpi := v_base -> 'kpis';
  IF v_n = 0 THEN
    v_kpi := v_kpi || jsonb_build_object('plan_completion_pct', NULL, 'schedule_adherence_pct', NULL);
  END IF;
  v_den := jsonb_build_object(
    'engagements_in_scope', v_n,
    'plan_completion_basis', 'average engagement progress across engagements in scope',
    'schedule_adherence_basis', 'engagements whose schedule health is a configured on-track label / engagements in scope');

  -- PERIOD MOVEMENT — every metric is driven by its own governed business date.
  SELECT jsonb_build_object(
    'audits_started', count(*) FILTER (WHERE e.actual_start_date BETWEEN v_s AND v_e),
    'audits_completed', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) BETWEEN v_s AND v_e
        AND COALESCE(e.status,'') NOT ILIKE 'Cancelled%'),
    'audits_closed_actions_pending', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) BETWEEN v_s AND v_e
        AND COALESCE(e.execution_status, e.status,'') ILIKE '%Actions Pending%'),
    'audits_delayed', count(*) FILTER (WHERE e.planned_end_date BETWEEN v_s AND v_e
        AND (e.actual_end_date IS NULL OR e.actual_end_date > e.planned_end_date)),
    'audits_cancelled', count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = e.id
          AND ev.event_code = 'IA.ENGAGEMENT.CANCELLED' AND ev.occurred_at::date BETWEEN v_s AND v_e)),
    'audits_carried_forward', count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = e.id
          AND ev.event_code = 'IA.ENGAGEMENT.CARRIED_FORWARD' AND ev.occurred_at::date BETWEEN v_s AND v_e)),
    'audits_rescheduled', count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.ia_engagement_schedule_history sh WHERE sh.engagement_id = e.id
          AND sh.created_at::date BETWEEN v_s AND v_e)),
    'audits_in_progress_at_period_end', count(*) FILTER (WHERE e.actual_start_date IS NOT NULL
        AND e.actual_start_date <= v_e
        AND (COALESCE(e.closure_date, e.actual_end_date) IS NULL OR COALESCE(e.closure_date, e.actual_end_date) > v_e))
  ) INTO v_move
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'findings_raised', count(*) FILTER (WHERE COALESCE(f.created_date, f.created_at::date) BETWEEN v_s AND v_e),
      'findings_critical_high_raised', count(*) FILTER (WHERE COALESCE(f.created_date, f.created_at::date) BETWEEN v_s AND v_e
          AND upper(COALESCE(f.severity, f.risk_rating,'')) IN ('CRITICAL','HIGH')),
      'findings_closed', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = f.id
            AND ev.event_code = 'IA.FINDING.CLOSED' AND ev.occurred_at::date BETWEEN v_s AND v_e)))
  INTO v_move
  FROM public.ia_findings f
  JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'management_responses_received', count(*) FILTER (
        WHERE COALESCE(mr.submitted_date, mr.created_at::date) BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_management_responses mr
  JOIN public.ia_findings f ON f.id = mr.finding_id
  JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'actions_created', count(*) FILTER (WHERE a.created_at::date BETWEEN v_s AND v_e),
      'actions_management_completed', count(*) FILTER (WHERE a.management_completion_date::date BETWEEN v_s AND v_e),
      'actions_verified', count(*) FILTER (WHERE COALESCE(a.verified_at, a.verification_date, a.verified_date)::date BETWEEN v_s AND v_e),
      'actions_reopened', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = a.id
            AND ev.event_code = 'IA.ACTION.REOPENED' AND ev.occurred_at::date BETWEEN v_s AND v_e)),
      'actions_extension_requested', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = a.id
            AND ev.event_code = 'IA.ACTION.EXTENSION_REQUESTED' AND ev.occurred_at::date BETWEEN v_s AND v_e)),
      'actions_extension_approved', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.ia_audit_event ev WHERE ev.entity_id = a.id
            AND ev.event_code = 'IA.ACTION.EXTENSION_APPROVED' AND ev.occurred_at::date BETWEEN v_s AND v_e)),
      'actions_newly_overdue', count(*) FILTER (
        WHERE COALESCE(a.current_target_date, a.target_date) BETWEEN v_s AND v_e
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Closed%'
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Verified%'
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Cancelled%'))
  INTO v_move
  FROM public.ia_action_tracking a
  JOIN public.ia_audit_engagements e ON e.id = a.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'followups_completed', count(*) FILTER (
        WHERE COALESCE(fu.verified_at::date, fu.resolved_date::date) BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_follow_ups fu
  JOIN public.ia_audit_engagements e ON e.id = fu.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'plan_amendments_approved', count(*) FILTER (
        WHERE COALESCE(pa.status,'') ILIKE '%Approv%'
          AND COALESCE(pa.updated_at, pa.created_at)::date BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_plan_amendments pa WHERE pa.plan_id = p_plan_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'completed_on'), '[]'::jsonb) INTO v_completed
  FROM (
    SELECT jsonb_build_object(
      'engagement_id', e.id, 'engagement_code', e.engagement_code, 'title', e.engagement_name,
      'department', (SELECT d.name FROM public.ia_departments d WHERE d.id = e.department_id),
      'function_id', e.function_id, 'audit_type', e.engagement_type,
      'risk_rating', e.engagement_risk_rating, 'objectives', e.objectives, 'scope', e.scope,
      'planned_start', e.planned_start_date, 'planned_end', e.planned_end_date,
      'actual_start', e.actual_start_date, 'actual_end', e.actual_end_date,
      'completed_on', COALESCE(e.closure_date, e.actual_end_date),
      'lead_auditor', (SELECT COALESCE(NULLIF(btrim(sp.display_name),''), sp.work_email)
                         FROM public.core_staff_profiles sp
                        WHERE sp.id = e.lead_auditor_id OR sp.user_id = e.lead_auditor_id LIMIT 1),
      'disposition', COALESCE(e.execution_status, e.status),
      'report_id', r.id, 'report_number', r.report_number,
      'report_issued_at', COALESCE(r.issued_at, r.approved_on),
      'audit_opinion', COALESCE(r.overall_assessment, r.risk_rating),
      'conclusion', r.conclusion,
      'executive_summary', COALESCE(r.executive_summary, r.key_highlights),
      'report_objective', r.audit_objective, 'report_scope', r.audit_scope,
      'findings_by_severity', COALESCE((
        SELECT jsonb_object_agg(sev, cnt) FROM (
          SELECT INITCAP(COALESCE(NULLIF(f.severity,''), NULLIF(f.risk_rating,''), 'Unrated')) sev, count(*) cnt
          FROM public.ia_findings f WHERE f.engagement_id = e.id GROUP BY 1) s), '{}'::jsonb),
      'significant_findings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title,
                 'severity', COALESCE(f.severity, f.risk_rating),
                 'status', COALESCE(f.lifecycle_status, f.status),
                 'recommendation', f.recommendation))
        FROM public.ia_findings f WHERE f.engagement_id = e.id
          AND upper(COALESCE(f.severity, f.risk_rating,'')) IN ('CRITICAL','HIGH')), '[]'::jsonb),
      'findings_total', (SELECT count(*) FROM public.ia_findings f WHERE f.engagement_id = e.id),
      'responses_received', (SELECT count(*) FROM public.ia_management_responses mr
                              JOIN public.ia_findings f ON f.id = mr.finding_id
                             WHERE f.engagement_id = e.id),
      'actions_total', (SELECT count(*) FROM public.ia_action_tracking a WHERE a.engagement_id = e.id),
      'actions_outstanding', (SELECT count(*) FROM public.ia_action_tracking a WHERE a.engagement_id = e.id
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Closed%'
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Verified%'
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Cancelled%'),
      'next_target_date', (SELECT min(COALESCE(a.current_target_date, a.target_date))
          FROM public.ia_action_tracking a WHERE a.engagement_id = e.id
          AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Closed%'),
      'follow_up_required', EXISTS (SELECT 1 FROM public.ia_follow_ups fu WHERE fu.engagement_id = e.id),
      'follow_up_date', (SELECT min(fu.scheduled_follow_up_date) FROM public.ia_follow_ups fu WHERE fu.engagement_id = e.id)
    ) AS x
    FROM public.ia_audit_engagements e
    LEFT JOIN LATERAL (
      SELECT * FROM public.ia_audit_reports r2
       WHERE r2.engagement_id = e.id AND r2.report_number IS NOT NULL
       ORDER BY (r2.issued_at IS NOT NULL) DESC,
                (COALESCE(r2.status,'') ILIKE 'Issued%') DESC,
                COALESCE(r2.issued_at, r2.created_at) DESC LIMIT 1) r ON true
    WHERE e.annual_plan_id = p_plan_id
      AND (p_department_id IS NULL OR e.department_id = p_department_id)
      AND COALESCE(e.closure_date, e.actual_end_date) BETWEEN v_s AND v_e
      AND COALESCE(e.status,'') NOT ILIKE 'Cancelled%'
  ) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'theme_code', t.theme_code, 'theme_name', t.theme_name,
           'finding_count', m.cnt, 'audit_count', m.audits, 'finding_ids', m.ids)
         ORDER BY m.cnt DESC), '[]'::jsonb) INTO v_themes
  FROM public.ia_finding_theme t
  JOIN LATERAL (
    SELECT count(*) cnt, count(DISTINCT f.engagement_id) audits, jsonb_agg(f.id) ids
    FROM public.ia_findings f
    JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
    WHERE e.annual_plan_id = p_plan_id
      AND (p_department_id IS NULL OR e.department_id = p_department_id)
      AND (COALESCE(f.title,'') ILIKE ANY (t.keywords)
        OR COALESCE(f.condition,'') ILIKE ANY (t.keywords)
        OR COALESCE(f.root_cause_category,'') ILIKE ANY (t.keywords)
        OR COALESCE(f.impact_area,'') ILIKE ANY (t.keywords))
  ) m ON m.cnt > 0
  WHERE t.is_active;

  -- COVERAGE — plan coverage and audit-universe coverage, with explicit denominators.
  SELECT jsonb_build_object(
    'planned_total', count(*),
    'completed_total', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'critical_planned', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'CRITICAL'),
    'critical_completed', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'CRITICAL'
        AND COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'high_planned', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'HIGH'),
    'high_completed', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'HIGH'
        AND COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'departments_planned', count(DISTINCT e.department_id),
    'departments_covered', count(DISTINCT e.department_id) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'functions_planned', count(DISTINCT e.function_id),
    'functions_covered', count(DISTINCT e.function_id) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'deferred_high_risk', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) IN ('CRITICAL','HIGH')
        AND (COALESCE(e.status,'') ILIKE 'Cancelled%' OR COALESCE(e.status,'') ILIKE 'Carried Forward%')),
    'plan_completion_coverage_pct', CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL) / count(*)) END
  ) INTO v_cov
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_cov || jsonb_build_object(
    'universe_total', count(*),
    'universe_high_risk_total', count(*) FILTER (WHERE upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH')),
    'universe_in_plan', count(*) FILTER (WHERE cov.covered),
    'universe_high_risk_in_plan', count(*) FILTER (WHERE cov.covered
        AND upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH')),
    'universe_high_risk_unscheduled', count(*) FILTER (WHERE NOT cov.covered
        AND upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH')),
    'universe_overdue_by_frequency', count(*) FILTER (WHERE u.next_audit_due IS NOT NULL
        AND u.next_audit_due < p_as_at::date AND NOT cov.audited_since_due),
    'universe_coverage_pct', CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE cov.covered) / count(*)) END,
    'universe_high_risk_coverage_pct',
        CASE WHEN count(*) FILTER (WHERE upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH')) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE cov.covered AND upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH'))
             / count(*) FILTER (WHERE upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH'))) END,
    'universe_basis', 'Denominator = active audit-universe entities in scope. NULL is returned when no entities apply; no percentage is fabricated.'
  ) INTO v_cov
  FROM public.ia_audit_universe u
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.ia_audit_engagements e
                    WHERE e.annual_plan_id = p_plan_id
                      AND (e.function_id = u.function_id OR e.department_id = u.department_id)
                      AND COALESCE(e.status,'') NOT ILIKE 'Cancelled%') AS covered,
           EXISTS (SELECT 1 FROM public.ia_audit_engagements e2
                    WHERE (e2.function_id = u.function_id OR e2.department_id = u.department_id)
                      AND COALESCE(e2.closure_date, e2.actual_end_date) >= u.next_audit_due) AS audited_since_due
  ) cov
  WHERE COALESCE(u.is_active, true)
    AND (p_department_id IS NULL OR u.department_id = p_department_id);

  SELECT jsonb_build_object(
    'fiscal_year_end', (SELECT fy.end_date FROM public.core_fiscal_year fy
                         JOIN public.ia_annual_plans ap ON ap.id = p_plan_id
                        WHERE fy.code = ap.fiscal_year LIMIT 1),
    'likely_to_close', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL
        OR (e.actual_start_date IS NOT NULL AND COALESCE(e.planned_end_date, v_e) >= CURRENT_DATE)),
    'likely_actions_pending', count(*) FILTER (WHERE COALESCE(e.execution_status, e.status,'') ILIKE '%Actions Pending%'),
    'at_risk_of_delay', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NULL
        AND e.planned_end_date < CURRENT_DATE),
    'likely_carry_forward', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NULL
        AND e.actual_start_date IS NULL AND e.planned_end_date < CURRENT_DATE),
    'expected_completion_pct', CASE WHEN count(*) = 0 THEN NULL ELSE round(
        100.0 * count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL
          OR (e.actual_start_date IS NOT NULL AND COALESCE(e.planned_end_date, v_e) >= CURRENT_DATE)) / count(*)) END,
    'management_response_delay', (SELECT count(*) FROM public.ia_findings f
        JOIN public.ia_audit_engagements e2 ON e2.id = f.engagement_id
       WHERE e2.annual_plan_id = p_plan_id AND f.response_due_date < CURRENT_DATE
         AND NOT EXISTS (SELECT 1 FROM public.ia_management_responses mr WHERE mr.finding_id = f.id)),
    'capacity_constrained', COALESCE((v_base -> 'capacity' ->> 'allocated_hours')::numeric, 0)
        > COALESCE((v_base -> 'capacity' ->> 'available_hours')::numeric, 0),
    'basis', 'Deterministic projection from planned dates, current lifecycle state and recorded capacity. No statistical estimation is applied.'
  ) INTO v_fc
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  RETURN v_base || jsonb_build_object(
    'kpis', v_kpi,
    'denominators', v_den,
    'period', v_per,
    'period_movement', COALESCE(v_move, '{}'::jsonb),
    'completed_audits', COALESCE(v_completed, '[]'::jsonb),
    'themes', COALESCE(v_themes, '[]'::jsonb),
    'coverage', COALESCE(v_cov, '{}'::jsonb),
    'forecast', COALESCE(v_fc, '{}'::jsonb),
    'data_quality', public.ia_management_data_quality(p_plan_id, p_department_id),
    'period_date_basis', jsonb_build_object(
      'audits_started','engagement actual start date',
      'audits_completed','engagement closure date (fallback actual end date)',
      'audits_cancelled','IA.ENGAGEMENT.CANCELLED event date',
      'audits_carried_forward','IA.ENGAGEMENT.CARRIED_FORWARD event date',
      'audits_rescheduled','engagement schedule history date',
      'findings_raised','finding created date',
      'findings_closed','IA.FINDING.CLOSED event date',
      'management_responses_received','response submitted date',
      'actions_created','action created date',
      'actions_management_completed','management completion date (not audit verification)',
      'actions_verified','audit verification date',
      'actions_reopened','IA.ACTION.REOPENED event date',
      'actions_extension_requested','IA.ACTION.EXTENSION_REQUESTED event date',
      'actions_extension_approved','IA.ACTION.EXTENSION_APPROVED event date',
      'followups_completed','follow-up verification / resolution date',
      'plan_amendments_approved','amendment approval record date'),
    'temporal_fidelity', jsonb_build_object(
      'as_at_is_historical', p_as_at::date < CURRENT_DATE,
      'reconstructed', jsonb_build_array('engagement start/end dates','findings raised','finding closures (event ledger)','management responses','actions created/completed/verified/reopened','follow-ups completed','plan amendments'),
      'current_state_only', jsonb_build_array('lifecycle status','risk ratings','capacity allocation','open action ageing'),
      'limitation', 'Cumulative lifecycle status is evaluated from current records. Only dated business events are reconstructed for a historical As At date. For an authoritative historical position use the issued IA-MSR report generated at that time.')
  );
END;
$function$;

-- EVIDENCE CAPTURE ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_msr_capture_evidence(p_report_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_r public.ia_management_status_report%ROWTYPE;
  v_kpis text[] := ARRAY['approved_engagements','closed','closed_actions_pending','in_progress',
                         'planned_not_started','delayed_at_risk','cancelled','carried_forward',
                         'findings_total','open_critical_high','overdue_responses','findings_raised','findings_closed',
                         'actions_open','actions_overdue','actions_awaiting_verification','actions_verified',
                         'universe_high_risk_unscheduled','universe_overdue_by_frequency'];
  k text; v_res jsonb; v_n int := 0;
BEGIN
  SELECT * INTO v_r FROM public.ia_management_status_report WHERE id = p_report_id;
  IF v_r.id IS NULL THEN RETURN 0; END IF;

  FOREACH k IN ARRAY v_kpis LOOP
    v_res := public.ia_management_status_drilldown(
      v_r.plan_id, k, v_r.status_as_at, v_r.department_id,
      COALESCE(v_r.snapshot -> 'period' ->> 'code', 'CURRENT'),
      (v_r.snapshot -> 'period' ->> 'start')::date,
      (v_r.snapshot -> 'period' ->> 'end')::date, NULL);
    IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
      INSERT INTO public.ia_management_status_report_evidence
        (report_id, kpi_code, record_type, record_id, record_code, record_label, department_id, attributes)
      SELECT p_report_id, k, rec ->> 'record_type', (rec ->> 'record_id')::uuid,
             rec ->> 'record_code', rec ->> 'record_label', v_r.department_id,
             COALESCE(rec -> 'attributes', '{}'::jsonb)
      FROM jsonb_array_elements(v_res -> 'records') rec;
      v_n := v_n + jsonb_array_length(v_res -> 'records');
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;