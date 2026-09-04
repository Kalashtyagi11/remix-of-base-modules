-- Config-driven engagement status model ------------------------------------
CREATE OR REPLACE FUNCTION public.ia_engagement_status_model(
  p_plan_id uuid,
  p_as_at timestamptz DEFAULT now(),
  p_department_id uuid DEFAULT NULL
)
RETURNS TABLE (
  engagement_id uuid, engagement_code text, engagement_name text, department_id uuid,
  department_name text, function_id uuid, risk_rating text, quarter text, audit_type text,
  coverage_category text, planned_start date, planned_end date, actual_start date, actual_end date,
  lifecycle_status text, workflow_stage text, progress_pct integer, progress_components jsonb,
  schedule_health text, variance_days integer, forecast_end date, lead_auditor text,
  findings_total integer, findings_critical_high integer, open_actions integer, overdue_actions integer,
  audit_opinion text, report_number text, next_milestone text, key_blocker text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_progm  jsonb := public.ia_report_methodology_active('PROGRESS');
  v_schedm jsonb := public.ia_report_methodology_active('SCHEDULE');
  v_prog   jsonb := COALESCE(v_progm -> 'config', '{}'::jsonb);
  v_sched  jsonb := COALESCE(v_schedm -> 'config', '{}'::jsonb);
  v_defw   numeric := COALESCE((v_prog ->> 'default_weight')::numeric, 5);
  v_floor  numeric := COALESCE((v_prog ->> 'terminal_weight_floor')::numeric, 95);
  v_maxex  numeric := COALESCE((v_prog ->> 'max_execution_contribution')::numeric, 10);
  v_ct_max numeric := COALESCE((SELECT (c ->> 'max_points')::numeric FROM jsonb_array_elements(COALESCE(v_prog -> 'execution_components','[]'::jsonb)) c WHERE c ->> 'code' = 'CONTROL_TESTS'), 5);
  v_wp_max numeric := COALESCE((SELECT (c ->> 'max_points')::numeric FROM jsonb_array_elements(COALESCE(v_prog -> 'execution_components','[]'::jsonb)) c WHERE c ->> 'code' = 'WORKING_PAPERS'), 3);
  v_fr_max numeric := COALESCE((SELECT (c ->> 'max_points')::numeric FROM jsonb_array_elements(COALESCE(v_prog -> 'execution_components','[]'::jsonb)) c WHERE c ->> 'code' = 'FINDING_RESPONSES'), 2);
  v_window integer := COALESCE((v_sched ->> 'at_risk_window_days')::integer, 14);
  v_ceil   numeric := COALESCE((v_sched ->> 'at_risk_progress_ceiling')::numeric, 65);
  v_nsrisk boolean := COALESCE((v_sched ->> 'not_started_after_planned_start_is_at_risk')::boolean, true);
  v_fdays  integer := COALESCE((v_sched ->> 'delay_forecast_days')::integer, 14);
  v_defms  text := COALESCE(v_prog ->> 'default_milestone', 'Schedule the engagement');
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT e.*, COALESCE(e.execution_status, e.status, 'Planned') AS eff_status
    FROM public.ia_audit_engagements e
    WHERE e.annual_plan_id = p_plan_id
      AND (p_department_id IS NULL OR e.department_id = p_department_id)
  ), stage AS (
    SELECT b.*, COALESCE((
      SELECT (s ->> 'weight')::numeric
      FROM jsonb_array_elements(COALESCE(v_prog -> 'stages', '[]'::jsonb)) WITH ORDINALITY t(s, ord)
      WHERE (
        (COALESCE(s ->> 'field','status') = 'status' AND b.eff_status ILIKE (s ->> 'match'))
        OR (s ->> 'field' = 'preparation_status' AND b.preparation_status IS NOT NULL
            AND b.preparation_status ILIKE (s ->> 'match'))
        OR (s ->> 'field' = 'scheduled' AND b.scheduled_at IS NOT NULL))
      ORDER BY ord LIMIT 1), v_defw) AS stage_weight
    FROM base b
  ), objs AS (
    SELECT s.*,
      (SELECT count(*) FROM public.ia_control_tests ct WHERE ct.engagement_id = s.id) AS ct_total,
      (SELECT count(*) FROM public.ia_control_tests ct WHERE ct.engagement_id = s.id
         AND (ct.concluded_at IS NOT NULL OR ct.status ILIKE '%Complete%' OR ct.result IS NOT NULL)) AS ct_done,
      (SELECT count(*) FROM public.ia_working_papers wp WHERE wp.engagement_id = s.id) AS wp_total,
      (SELECT count(*) FROM public.ia_working_papers wp WHERE wp.engagement_id = s.id
         AND (wp.approved_date IS NOT NULL OR wp.status ILIKE '%Approved%' OR wp.status ILIKE '%Reviewed%')) AS wp_done,
      (SELECT count(*) FROM public.ia_findings f WHERE f.engagement_id = s.id) AS f_total,
      (SELECT count(*) FROM public.ia_findings f WHERE f.engagement_id = s.id
         AND upper(COALESCE(f.severity, f.risk_rating, '')) IN ('CRITICAL','HIGH')) AS f_ch,
      (SELECT count(*) FROM public.ia_findings f
         JOIN public.ia_management_responses mr ON mr.finding_id = f.id
        WHERE f.engagement_id = s.id) AS f_responded,
      (SELECT count(*) FROM public.ia_action_tracking a WHERE a.engagement_id = s.id
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Closed%'
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Verified%'
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Cancelled%') AS a_open,
      (SELECT count(*) FROM public.ia_action_tracking a WHERE a.engagement_id = s.id
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Closed%'
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Verified%'
         AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Cancelled%'
         AND COALESCE(a.current_target_date, a.target_date) < p_as_at::date) AS a_overdue,
      (SELECT r.report_number FROM public.ia_audit_reports r WHERE r.engagement_id = s.id
         AND r.report_number IS NOT NULL
         ORDER BY (r.issued_at IS NOT NULL) DESC, COALESCE(r.issued_at, r.created_at) DESC LIMIT 1) AS rpt_number,
      (SELECT COALESCE(r.overall_assessment, r.risk_rating) FROM public.ia_audit_reports r
        WHERE r.engagement_id = s.id
        ORDER BY (r.issued_at IS NOT NULL) DESC, COALESCE(r.issued_at, r.created_at) DESC LIMIT 1) AS rpt_opinion
    FROM stage s
  ), calc AS (
    SELECT o.*,
      LEAST(v_maxex, (CASE WHEN o.ct_total > 0 THEN v_ct_max * o.ct_done / o.ct_total ELSE 0 END)
                   + (CASE WHEN o.wp_total > 0 THEN v_wp_max * o.wp_done / o.wp_total ELSE 0 END)
                   + (CASE WHEN o.f_total  > 0 THEN v_fr_max * o.f_responded / o.f_total ELSE 0 END)
      )::numeric AS evidence_bonus
    FROM objs o
  )
  SELECT
    c.id, c.engagement_code, c.engagement_name, c.department_id,
    (SELECT d.name FROM public.ia_departments d WHERE d.id = c.department_id),
    c.function_id, c.engagement_risk_rating, c.quarter, c.engagement_type, c.coverage_category,
    c.planned_start_date, c.planned_end_date, c.actual_start_date, c.actual_end_date,
    c.eff_status, c.eff_status,
    (CASE
      WHEN c.stage_weight >= v_floor OR c.eff_status ILIKE 'Cancelled%' THEN c.stage_weight
      ELSE LEAST(100, (c.stage_weight + c.evidence_bonus))
    END)::integer,
    jsonb_build_object(
      'lifecycle_stage', c.eff_status,
      'stage_weight', c.stage_weight,
      'evidence_bonus', round(c.evidence_bonus, 1),
      'methodology_version', COALESCE(v_progm ->> 'version', 'unversioned'),
      'control_tests', jsonb_build_object('completed', c.ct_done, 'total', c.ct_total, 'max_points', v_ct_max),
      'working_papers', jsonb_build_object('completed', c.wp_done, 'total', c.wp_total, 'max_points', v_wp_max),
      'findings_responded', jsonb_build_object('completed', c.f_responded, 'total', c.f_total, 'max_points', v_fr_max),
      'explanation', format(
        'Progress methodology v%s: lifecycle stage "%s" contributes %s%%; completed execution objects add %s%% (control tests %s/%s, working papers %s/%s, responded findings %s/%s).',
        COALESCE(v_progm ->> 'version', '-'), c.eff_status, c.stage_weight, round(c.evidence_bonus, 1),
        c.ct_done, c.ct_total, c.wp_done, c.wp_total, c.f_responded, c.f_total)
    ),
    CASE
      WHEN c.eff_status ILIKE 'Cancelled%' THEN 'Cancelled'
      WHEN c.stage_weight >= v_floor AND c.actual_end_date IS NOT NULL AND c.planned_end_date IS NOT NULL
           AND c.actual_end_date > c.planned_end_date THEN 'Completed Late'
      WHEN c.stage_weight >= v_floor THEN 'Completed On Time'
      WHEN c.planned_end_date IS NOT NULL AND c.planned_end_date < p_as_at::date THEN 'Delayed'
      WHEN v_nsrisk AND c.planned_start_date IS NOT NULL AND c.planned_start_date < p_as_at::date
           AND c.actual_start_date IS NULL THEN 'At Risk'
      WHEN c.planned_end_date IS NOT NULL
           AND c.planned_end_date - p_as_at::date <= v_window
           AND c.stage_weight < v_ceil THEN 'At Risk'
      ELSE 'On Track'
    END,
    (CASE
      WHEN c.planned_end_date IS NULL THEN NULL
      WHEN c.stage_weight >= v_floor AND c.actual_end_date IS NOT NULL
        THEN (c.actual_end_date - c.planned_end_date)
      WHEN c.stage_weight < v_floor AND p_as_at::date > c.planned_end_date
        THEN (p_as_at::date - c.planned_end_date)
      ELSE 0
    END)::integer,
    CASE
      WHEN c.stage_weight >= v_floor THEN c.actual_end_date
      WHEN c.planned_end_date IS NOT NULL AND p_as_at::date > c.planned_end_date THEN p_as_at::date + v_fdays
      ELSE c.planned_end_date
    END,
    (SELECT COALESCE(NULLIF(btrim(sp.display_name), ''), sp.work_email)
       FROM public.core_staff_profiles sp
      WHERE sp.id = c.lead_auditor_id OR sp.user_id = c.lead_auditor_id LIMIT 1),
    c.f_total::integer, c.f_ch::integer, c.a_open::integer, c.a_overdue::integer,
    c.rpt_opinion, c.rpt_number,
    CASE
      WHEN c.eff_status ILIKE 'Closed%' OR c.eff_status ILIKE 'Cancelled%' THEN 'None - terminal'
      ELSE COALESCE((
        SELECT m ->> 'label' FROM jsonb_array_elements(COALESCE(v_prog -> 'milestones','[]'::jsonb)) m
        WHERE c.stage_weight >= (m ->> 'min')::numeric
        ORDER BY (m ->> 'min')::numeric DESC LIMIT 1), v_defms)
    END,
    CASE
      WHEN c.a_overdue > 0 THEN format('%s overdue corrective action(s)', c.a_overdue)
      WHEN c.planned_end_date IS NOT NULL AND c.planned_end_date < p_as_at::date
           AND c.stage_weight < v_floor THEN 'Past planned end date'
      WHEN c.planned_start_date IS NOT NULL AND c.planned_start_date < p_as_at::date
           AND c.actual_start_date IS NULL THEN 'Not started after planned start'
      WHEN c.lead_auditor_id IS NULL THEN 'No lead auditor assigned'
      ELSE NULL
    END
  FROM calc c
  ORDER BY c.quarter NULLS LAST, c.engagement_code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_engagement_status_model(uuid, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_engagement_status_model(uuid, timestamptz, uuid)
  TO authenticated, service_role;

-- Config-driven plan health + provenance ------------------------------------
CREATE OR REPLACE FUNCTION public.ia_management_status_live(
  p_plan_id uuid,
  p_as_at timestamptz DEFAULT now(),
  p_audience text DEFAULT 'HIA',
  p_department_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_plan   public.ia_annual_plans%ROWTYPE;
  v_rows   jsonb;
  v_kpi    jsonb;
  v_dept   uuid := p_department_id;
  v_health text;
  v_score  numeric := 0;
  v_cap    jsonb;
  v_find   jsonb;
  v_act    jsonb;
  v_prior  jsonb;
  v_change jsonb;
  v_attn   jsonb;
  v_hm     jsonb := public.ia_report_methodology_active('PLAN_HEALTH');
  v_pm     jsonb := public.ia_report_methodology_active('PROGRESS');
  v_sm     jsonb := public.ia_report_methodology_active('SCHEDULE');
  v_hcfg   jsonb := COALESCE(v_hm -> 'config', '{}'::jsonb);
  v_inprog numeric := COALESCE((v_pm -> 'config' ->> 'in_progress_min_pct')::numeric, 20);
  v_sev    jsonb := COALESCE(v_hcfg -> 'attention_severity', '{}'::jsonb);
  v_fired  jsonb := '[]'::jsonb;
  r        jsonb;
  v_val    numeric;
  v_hit    boolean;
BEGIN
  IF NOT public.ia_can_view_annual_plan(p_plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;

  SELECT * INTO v_plan FROM public.ia_annual_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'plan_not_found');
  END IF;

  IF upper(COALESCE(p_audience, '')) IN ('DEPARTMENT', 'DEPARTMENT MANAGEMENT', 'DEPARTMENT_MANAGEMENT')
     AND v_dept IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'department_scope_required');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO v_rows
  FROM public.ia_engagement_status_model(p_plan_id, p_as_at, v_dept) m;

  SELECT jsonb_build_object(
    'approved_engagements', count(*),
    'closed', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE 'Closed%'
                                 AND e ->> 'lifecycle_status' NOT ILIKE '%Actions Pending%'),
    'closed_actions_pending', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE '%Actions Pending%'),
    'in_progress', count(*) FILTER (WHERE (e ->> 'progress_pct')::numeric >= v_inprog
                                      AND (e ->> 'progress_pct')::numeric < 95
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Closed%'
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Cancelled%'),
    'planned_not_started', count(*) FILTER (WHERE (e ->> 'progress_pct')::numeric < v_inprog
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Cancelled%'),
    'delayed_at_risk', count(*) FILTER (WHERE e ->> 'schedule_health' IN ('Delayed','At Risk')),
    'cancelled', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE 'Cancelled%'),
    'carried_forward', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE 'Carried Forward%'),
    'plan_completion_pct', COALESCE(round(avg((e ->> 'progress_pct')::numeric)), 0),
    'schedule_adherence_pct', CASE WHEN count(*) = 0 THEN 0 ELSE
        round(100.0 * count(*) FILTER (WHERE (e ->> 'schedule_health') = ANY (
              SELECT jsonb_array_elements_text(COALESCE(v_sm -> 'config' -> 'on_track_labels',
                     jsonb_build_array('On Track','Completed On Time'))))) / count(*)) END,
    'findings_total', COALESCE(sum((e ->> 'findings_total')::int), 0),
    'findings_critical_high_open', COALESCE(sum((e ->> 'findings_critical_high')::int), 0),
    'open_actions', COALESCE(sum((e ->> 'open_actions')::int), 0),
    'overdue_actions', COALESCE(sum((e ->> 'overdue_actions')::int), 0)
  ) INTO v_kpi
  FROM jsonb_array_elements(v_rows) e;

  SELECT jsonb_build_object(
    'by_severity', COALESCE((
       SELECT jsonb_object_agg(sev, cnt) FROM (
         SELECT COALESCE(NULLIF(upper(COALESCE(f.severity, f.risk_rating)), ''), 'UNRATED') sev, count(*) cnt
         FROM public.ia_findings f
         JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
         WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
         GROUP BY 1) s), '{}'::jsonb),
    'open_critical_high', (
       SELECT count(*) FROM public.ia_findings f
       JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
       WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
         AND upper(COALESCE(f.severity, f.risk_rating, '')) IN ('CRITICAL','HIGH')
         AND COALESCE(f.lifecycle_status, f.status, '') NOT ILIKE '%Closed%'),
    'overdue_responses', (
       SELECT count(*) FROM public.ia_findings f
       JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
       LEFT JOIN public.ia_management_responses mr ON mr.finding_id = f.id AND COALESCE(mr.is_current, true)
       WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
         AND mr.id IS NULL AND f.response_due_date IS NOT NULL
         AND f.response_due_date < p_as_at::date),
    'disputed', (
       SELECT count(*) FROM public.ia_management_responses mr
       JOIN public.ia_audit_engagements e ON e.id = mr.engagement_id
       WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
         AND COALESCE(mr.dispute_state, '') <> ''),
    'repeat_prior_year', (
       SELECT count(*) FROM public.ia_findings f
       JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
       WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
         AND EXISTS (
           SELECT 1 FROM public.ia_findings pf
           JOIN public.ia_audit_engagements pe ON pe.id = pf.engagement_id
           WHERE pe.annual_plan_id <> p_plan_id
             AND pf.department_id = f.department_id
             AND lower(COALESCE(pf.title,'')) = lower(COALESCE(f.title,''))))
  ) INTO v_find;

  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%' AND st NOT ILIKE '%Cancelled%'),
    'in_progress', count(*) FILTER (WHERE st ILIKE '%In Progress%'),
    'awaiting_verification', count(*) FILTER (WHERE st ILIKE '%Verification%' OR st ILIKE '%Management Completed%'),
    'verified', count(*) FILTER (WHERE st ILIKE '%Verified%' OR st ILIKE '%Closed%'),
    'overdue', count(*) FILTER (WHERE due < p_as_at::date AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%' AND st NOT ILIKE '%Cancelled%'),
    'due_soon', count(*) FILTER (WHERE due BETWEEN p_as_at::date AND (p_as_at::date + 30) AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%'),
    'ageing', jsonb_build_object(
      'lt_30', count(*) FILTER (WHERE due >= p_as_at::date - 30 AND due < p_as_at::date AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%'),
      'd30_60', count(*) FILTER (WHERE due >= p_as_at::date - 60 AND due < p_as_at::date - 30 AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%'),
      'd60_90', count(*) FILTER (WHERE due >= p_as_at::date - 90 AND due < p_as_at::date - 60 AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%'),
      'gt_90', count(*) FILTER (WHERE due < p_as_at::date - 90 AND st NOT ILIKE '%Closed%' AND st NOT ILIKE '%Verified%'))
  ) INTO v_act
  FROM (
    SELECT COALESCE(a.lifecycle_status, a.status, '') st,
           COALESCE(a.current_target_date, a.target_date) due
    FROM public.ia_action_tracking a
    JOIN public.ia_audit_engagements e ON e.id = a.engagement_id
    WHERE e.annual_plan_id = p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
  ) t;

  SELECT jsonb_build_object(
    'prior_open_actions', (
      SELECT count(*) FROM public.ia_action_tracking a
      JOIN public.ia_audit_engagements e ON e.id = a.engagement_id
      WHERE e.annual_plan_id <> p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
        AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Closed%'
        AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Verified%'
        AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Cancelled%'),
    'prior_critical_high_findings', (
      SELECT count(*) FROM public.ia_findings f
      JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
      WHERE e.annual_plan_id <> p_plan_id AND (v_dept IS NULL OR e.department_id = v_dept)
        AND upper(COALESCE(f.severity, f.risk_rating, '')) IN ('CRITICAL','HIGH')
        AND COALESCE(f.lifecycle_status, f.status, '') NOT ILIKE '%Closed%'),
    'follow_ups_due', (
      SELECT count(*) FROM public.ia_follow_ups fu
      WHERE COALESCE(fu.lifecycle_status, fu.status, '') NOT ILIKE '%Closed%'
        AND fu.scheduled_follow_up_date BETWEEN p_as_at::date AND (p_as_at::date + 30)
        AND (v_dept IS NULL OR fu.department_id = v_dept)),
    'follow_ups_overdue', (
      SELECT count(*) FROM public.ia_follow_ups fu
      WHERE COALESCE(fu.lifecycle_status, fu.status, '') NOT ILIKE '%Closed%'
        AND fu.scheduled_follow_up_date < p_as_at::date
        AND (v_dept IS NULL OR fu.department_id = v_dept)),
    'partially_implemented', (
      SELECT count(*) FROM public.ia_action_tracking a
      WHERE COALESCE(a.progress_pct, 0) BETWEEN 1 AND 99
        AND COALESCE(a.lifecycle_status, a.status, '') NOT ILIKE '%Closed%'
        AND (v_dept IS NULL OR a.department_id = v_dept))
  ) INTO v_prior;

  SELECT jsonb_build_object(
    'available_hours', COALESCE(v_plan.total_available_hours, 0),
    'planned_hours', COALESCE(v_plan.planned_hours, 0),
    'allocated_hours', COALESCE((SELECT sum(COALESCE(e.estimated_hours, e.budgeted_hours, 0))
                                 FROM public.ia_audit_engagements e
                                 WHERE e.annual_plan_id = p_plan_id
                                   AND (v_dept IS NULL OR e.department_id = v_dept)), 0),
    'contingency_hours', COALESCE(v_plan.contingency_hours, 0),
    'leave_days', COALESCE((SELECT sum(GREATEST(0, (lr.end_date - lr.start_date) + 1))
                            FROM public.ia_leave_requests lr
                            WHERE lr.status ILIKE '%Approved%'
                              AND lr.start_date <= COALESCE(v_plan.planned_end_date, p_as_at::date)
                              AND lr.end_date  >= COALESCE(v_plan.planned_start_date, p_as_at::date - 365)), 0)
  ) INTO v_cap;
  v_cap := v_cap || jsonb_build_object(
    'remaining_hours', (v_cap ->> 'available_hours')::numeric - (v_cap ->> 'allocated_hours')::numeric,
    'over_allocated', ((v_cap ->> 'allocated_hours')::numeric > (v_cap ->> 'available_hours')::numeric));

  SELECT jsonb_build_object(
    'current_version', COALESCE(v_plan.current_version_number, 1),
    'amendments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'amendment_type', pa.amendment_type, 'field', pa.field_changed,
        'old_value', pa.old_value, 'new_value', pa.new_value,
        'reason', pa.reason, 'status', pa.status,
        'approved_by', pa.approved_by, 'date', pa.created_at) ORDER BY pa.created_at)
      FROM public.ia_plan_amendments pa WHERE pa.plan_id = p_plan_id), '[]'::jsonb),
    'cancelled_engagements', (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                              WHERE e ->> 'lifecycle_status' ILIKE 'Cancelled%'),
    'carried_forward_engagements', (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                              WHERE e ->> 'lifecycle_status' ILIKE 'Carried Forward%')
  ) INTO v_change;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_attn FROM (
    SELECT jsonb_build_object(
      'severity', COALESCE(v_sev ->> 'overdue_action', 'Critical'), 'category', 'Overdue corrective action',
      'title', format('%s - %s overdue corrective action(s)', e ->> 'engagement_code', e ->> 'overdue_actions'),
      'link', '/audit/audits/' || (e ->> 'engagement_id') || '?tab=actions',
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id') x
    FROM jsonb_array_elements(v_rows) e WHERE (e ->> 'overdue_actions')::int > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', COALESCE(v_sev ->> 'delayed_engagement', 'High'), 'category', 'Audit significantly behind schedule',
      'title', format('%s is %s day(s) past its planned end date', e ->> 'engagement_code', e ->> 'variance_days'),
      'link', '/audit/audits/' || (e ->> 'engagement_id'),
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id')
    FROM jsonb_array_elements(v_rows) e
    WHERE e ->> 'schedule_health' = 'Delayed' AND COALESCE((e ->> 'variance_days')::int, 0) > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', COALESCE(v_sev ->> 'critical_high_finding', 'Critical'), 'category', 'Critical / High finding requiring escalation',
      'title', format('%s has %s open Critical/High finding(s)', e ->> 'engagement_code', e ->> 'findings_critical_high'),
      'link', '/audit/audits/' || (e ->> 'engagement_id') || '?tab=findings',
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id')
    FROM jsonb_array_elements(v_rows) e WHERE (e ->> 'findings_critical_high')::int > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', COALESCE(v_sev ->> 'capacity', 'Medium'), 'category', 'Resource / capacity constraint',
      'title', 'Allocated effort exceeds available audit capacity',
      'link', '/audit/audit-plans/' || p_plan_id::text || '?tab=capacity',
      'source_type', 'plan', 'source_id', p_plan_id::text)
    WHERE (v_cap ->> 'over_allocated')::boolean
  ) q;

  -- Configured plan health rules
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(v_hcfg -> 'rules', '[]'::jsonb)) LOOP
    v_val := CASE r ->> 'metric'
      WHEN 'schedule_adherence_pct'   THEN (v_kpi ->> 'schedule_adherence_pct')::numeric
      WHEN 'plan_completion_pct'      THEN (v_kpi ->> 'plan_completion_pct')::numeric
      WHEN 'open_critical_high'       THEN (v_find ->> 'open_critical_high')::numeric
      WHEN 'overdue_actions'          THEN (v_act ->> 'overdue')::numeric
      WHEN 'capacity_over_allocated'  THEN CASE WHEN (v_cap ->> 'over_allocated')::boolean THEN 1 ELSE 0 END
      ELSE NULL END;
    IF v_val IS NULL THEN CONTINUE; END IF;
    v_hit := CASE r ->> 'operator'
      WHEN '<'  THEN v_val <  (r ->> 'threshold')::numeric
      WHEN '<=' THEN v_val <= (r ->> 'threshold')::numeric
      WHEN '>'  THEN v_val >  (r ->> 'threshold')::numeric
      WHEN '>=' THEN v_val >= (r ->> 'threshold')::numeric
      WHEN '='  THEN v_val =  (r ->> 'threshold')::numeric
      ELSE false END;
    IF v_hit THEN
      v_score := v_score + COALESCE((r ->> 'score')::numeric, 1);
      v_fired := v_fired || jsonb_build_array(jsonb_build_object(
        'rule', r ->> 'code', 'label', r ->> 'label', 'severity', r ->> 'severity',
        'metric', r ->> 'metric', 'observed', v_val, 'threshold', (r ->> 'threshold')::numeric,
        'score', COALESCE((r ->> 'score')::numeric, 1)));
    END IF;
  END LOOP;

  v_health := CASE
    WHEN v_score >= COALESCE((v_hcfg -> 'bands' ->> 'red_min_score')::numeric, 4) THEN 'RED'
    WHEN v_score >= COALESCE((v_hcfg -> 'bands' ->> 'amber_min_score')::numeric, 2) THEN 'AMBER'
    ELSE 'GREEN' END;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', jsonb_build_object('id', v_plan.id, 'title', v_plan.title,
                               'fiscal_year', v_plan.fiscal_year, 'status', v_plan.status,
                               'version', COALESCE(v_plan.current_version_number, 1)),
    'as_at', p_as_at,
    'audience', p_audience,
    'department_id', v_dept,
    'kpis', v_kpi,
    'engagements', v_rows,
    'findings', v_find,
    'actions', v_act,
    'prior_history', v_prior,
    'capacity', v_cap,
    'plan_changes', v_change,
    'management_attention', v_attn,
    'health', jsonb_build_object(
      'rating', v_health, 'score', v_score,
      'methodology_version', COALESCE(v_hm ->> 'version', 'unversioned'),
      'rules_triggered', v_fired,
      'bands', COALESCE(v_hcfg -> 'bands', '{}'::jsonb),
      'basis', format('Plan health methodology v%s — configured thresholds evaluated against approved metrics.',
                      COALESCE(v_hm ->> 'version', '-'))),
    'provenance', jsonb_build_object(
      'progress_methodology_version', v_pm ->> 'version',
      'schedule_methodology_version', v_sm ->> 'version',
      'health_methodology_version', v_hm ->> 'version',
      'plan_version', COALESCE(v_plan.current_version_number, 1),
      'organisation_country', public.ia_org_country_code(),
      'calculated_at', now())
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_management_status_live(uuid, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_management_status_live(uuid, timestamptz, text, uuid)
  TO authenticated, service_role;

-- Audience validated against reference master, not a fixed list -------------
ALTER TABLE public.ia_management_status_report DROP CONSTRAINT IF EXISTS ia_msr_audience_chk;

CREATE OR REPLACE FUNCTION public.zz_ia_msr_audience_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.ia_reference_value v
     WHERE v.reference_type = 'MANAGEMENT_REPORT_AUDIENCE'
       AND v.code = NEW.audience AND COALESCE(v.is_active, true)) THEN
    RAISE EXCEPTION 'IA_MSR_AUDIENCE_INVALID: % is not a configured management report audience', NEW.audience;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.zz_ia_msr_audience_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_ia_msr_audience_guard ON public.ia_management_status_report;
CREATE TRIGGER zz_ia_msr_audience_guard
  BEFORE INSERT ON public.ia_management_status_report
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_msr_audience_guard();

-- Generation records full configuration provenance --------------------------
CREATE OR REPLACE FUNCTION public.ia_generate_management_status_report(
  p_plan_id uuid,
  p_audience text DEFAULT 'HIA',
  p_reporting_period text DEFAULT NULL,
  p_as_at timestamptz DEFAULT now(),
  p_department_id uuid DEFAULT NULL,
  p_compare_report_id uuid DEFAULT NULL,
  p_period_code text DEFAULT 'CURRENT',
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_report_mode text DEFAULT 'Detailed Management Report'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_live jsonb;
  v_prev public.ia_management_status_report%ROWTYPE;
  v_cmp  jsonb := NULL;
  v_row  public.ia_management_status_report%ROWTYPE;
  v_plan public.ia_annual_plans%ROWTYPE;
  v_def  public.ia_report_definition%ROWTYPE;
  v_prov jsonb;
BEGIN
  IF NOT public.ia_can_view_annual_plan(p_plan_id) THEN
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
    'generated_at', now(),
    'status_as_at', p_as_at);

  v_live := v_live || jsonb_build_object('provenance',
      COALESCE(v_live -> 'provenance', '{}'::jsonb) || v_prov);

  IF p_compare_report_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ia_management_status_report WHERE id = p_compare_report_id;
  ELSE
    SELECT * INTO v_prev FROM public.ia_management_status_report
     WHERE plan_id = p_plan_id AND audience = p_audience AND status = 'Sealed'
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
        GREATEST(0, (v_live -> 'kpis' ->> 'findings_critical_high_open')::int
                  - COALESCE((v_prev.snapshot -> 'kpis' ->> 'findings_critical_high_open')::int, 0)),
      'significant_findings_closed',
        GREATEST(0, COALESCE((v_prev.snapshot -> 'kpis' ->> 'findings_critical_high_open')::int, 0)
                  - (v_live -> 'kpis' ->> 'findings_critical_high_open')::int),
      'actions_newly_overdue',
        GREATEST(0, (v_live -> 'actions' ->> 'overdue')::int
                  - COALESCE((v_prev.snapshot -> 'actions' ->> 'overdue')::int, 0)),
      'actions_closed',
        GREATEST(0, (v_live -> 'actions' ->> 'verified')::int
                  - COALESCE((v_prev.snapshot -> 'actions' ->> 'verified')::int, 0)),
      'plan_amendments',
        GREATEST(0, jsonb_array_length(v_live -> 'plan_changes' -> 'amendments')
                  - COALESCE(jsonb_array_length(v_prev.snapshot -> 'plan_changes' -> 'amendments'), 0)),
      'plan_completion_delta',
        (v_live -> 'kpis' ->> 'plan_completion_pct')::int
          - COALESCE((v_prev.snapshot -> 'kpis' ->> 'plan_completion_pct')::int, 0),
      'methodology_changed',
        (v_prev.config_provenance -> 'health_methodology' ->> 'version')
          IS DISTINCT FROM (v_prov -> 'health_methodology' ->> 'version')
        OR (v_prev.config_provenance -> 'progress_methodology' ->> 'version')
          IS DISTINCT FROM (v_prov -> 'progress_methodology' ->> 'version')
    ) INTO v_cmp
    FROM cur LEFT JOIN prv ON prv.id = cur.id;
  END IF;

  INSERT INTO public.ia_management_status_report (
    plan_id, plan_version_number, fiscal_year, reporting_period, status_as_at,
    audience, department_id, snapshot, comparison_report_id, comparison, generated_by, config_provenance
  ) VALUES (
    p_plan_id, COALESCE(v_plan.current_version_number, 1), v_plan.fiscal_year,
    COALESCE(p_reporting_period, v_live -> 'period' ->> 'label'), p_as_at,
    p_audience, p_department_id, v_live, v_prev.id, v_cmp,
    COALESCE(auth.jwt() ->> 'email', auth.uid()::text), v_prov
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'report_id', v_row.id, 'report_number', v_row.report_number);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid, text, date, date, text)
  TO authenticated, service_role;

-- Sealed provenance is immutable too
CREATE OR REPLACE FUNCTION public.zz_ia_msr_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IA_MSR_SEALED: a sealed management status report cannot be deleted';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.status_as_at IS DISTINCT FROM OLD.status_as_at
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.comparison IS DISTINCT FROM OLD.comparison
     OR (OLD.config_provenance IS NOT NULL AND NEW.config_provenance IS DISTINCT FROM OLD.config_provenance) THEN
    RAISE EXCEPTION 'IA_MSR_SEALED: sealed management status report data is immutable';
  END IF;
  RETURN NEW;
END;
$fn$;