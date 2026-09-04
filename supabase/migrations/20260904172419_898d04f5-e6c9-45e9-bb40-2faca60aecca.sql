-- INTERNAL AUDIT — Audit Plan Status & Management Reporting

INSERT INTO public.core_number_sequence
  (module_code, entity_type, country_code, prefix_pattern, number_pattern, separator,
   padding_length, current_number, reset_frequency, is_active, description, created_by)
SELECT 'INTERNAL_AUDIT','MANAGEMENT_STATUS_REPORT','SKN','IA-MSR-SKN',
       'IA-MSR-SKN-{YYYY}-{SEQ}','-',6,0,'YEARLY',TRUE,
       'Internal Audit management status report authoritative number','IA_MSR'
WHERE NOT EXISTS (
  SELECT 1 FROM public.core_number_sequence s
  WHERE s.module_code = 'INTERNAL_AUDIT'
    AND s.entity_type = 'MANAGEMENT_STATUS_REPORT'
    AND s.country_code = 'SKN'
);

CREATE OR REPLACE FUNCTION public.ia_engagement_status_model(
  p_plan_id uuid,
  p_as_at timestamptz DEFAULT now(),
  p_department_id uuid DEFAULT NULL
)
RETURNS TABLE (
  engagement_id uuid,
  engagement_code text,
  engagement_name text,
  department_id uuid,
  department_name text,
  function_id uuid,
  risk_rating text,
  quarter text,
  audit_type text,
  coverage_category text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  lifecycle_status text,
  workflow_stage text,
  progress_pct integer,
  progress_components jsonb,
  schedule_health text,
  variance_days integer,
  forecast_end date,
  lead_auditor text,
  findings_total integer,
  findings_critical_high integer,
  open_actions integer,
  overdue_actions integer,
  audit_opinion text,
  report_number text,
  next_milestone text,
  key_blocker text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
WITH base AS (
  SELECT e.*, COALESCE(e.execution_status, e.status, 'Planned') AS eff_status
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id)
), stage AS (
  SELECT b.*,
    CASE
      WHEN b.eff_status ILIKE 'Cancelled%'                THEN 0
      WHEN b.eff_status ILIKE 'Closed %Actions Pending%'  THEN 95
      WHEN b.eff_status ILIKE '%Actions Pending%'         THEN 95
      WHEN b.eff_status ILIKE 'Closed%'                   THEN 100
      WHEN b.eff_status ILIKE 'Carried Forward%'          THEN 60
      WHEN b.eff_status ILIKE '%Report Issued%'           THEN 85
      WHEN b.eff_status ILIKE '%Draft Report%'
        OR b.eff_status ILIKE '%Reporting%'               THEN 65
      WHEN b.eff_status ILIKE '%Fieldwork%'
        OR b.eff_status ILIKE '%In Progress%'
        OR b.eff_status ILIKE '%Execution%'               THEN 45
      WHEN b.preparation_status IS NOT NULL
       AND b.preparation_status ILIKE '%Complete%'        THEN 20
      WHEN b.scheduled_at IS NOT NULL                     THEN 10
      ELSE 5
    END AS stage_weight
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
       AND r.report_number IS NOT NULL ORDER BY r.created_at DESC LIMIT 1) AS rpt_number,
    (SELECT COALESCE(r.overall_assessment, r.risk_rating) FROM public.ia_audit_reports r
      WHERE r.engagement_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS rpt_opinion
  FROM stage s
), calc AS (
  SELECT o.*,
    LEAST(10, (CASE WHEN o.ct_total > 0 THEN 5.0 * o.ct_done / o.ct_total ELSE 0 END)
            + (CASE WHEN o.wp_total > 0 THEN 3.0 * o.wp_done / o.wp_total ELSE 0 END)
            + (CASE WHEN o.f_total  > 0 THEN 2.0 * o.f_responded / o.f_total ELSE 0 END)
    )::numeric AS evidence_bonus
  FROM objs o
)
SELECT
  c.id,
  c.engagement_code,
  c.engagement_name,
  c.department_id,
  (SELECT d.name FROM public.ia_departments d WHERE d.id = c.department_id),
  c.function_id,
  c.engagement_risk_rating,
  c.quarter,
  c.engagement_type,
  c.coverage_category,
  c.planned_start_date,
  c.planned_end_date,
  c.actual_start_date,
  c.actual_end_date,
  c.eff_status,
  c.eff_status,
  (CASE
    WHEN c.stage_weight >= 95 OR c.eff_status ILIKE 'Cancelled%' THEN c.stage_weight
    ELSE LEAST(100, (c.stage_weight + c.evidence_bonus))::integer
  END)::integer,
  jsonb_build_object(
    'lifecycle_stage', c.eff_status,
    'stage_weight', c.stage_weight,
    'evidence_bonus', round(c.evidence_bonus, 1),
    'control_tests', jsonb_build_object('completed', c.ct_done, 'total', c.ct_total, 'max_points', 5),
    'working_papers', jsonb_build_object('completed', c.wp_done, 'total', c.wp_total, 'max_points', 3),
    'findings_responded', jsonb_build_object('completed', c.f_responded, 'total', c.f_total, 'max_points', 2),
    'explanation', format(
      'Lifecycle stage "%s" contributes %s%%; completed execution objects add %s%% (control tests %s/%s, working papers %s/%s, responded findings %s/%s).',
      c.eff_status, c.stage_weight, round(c.evidence_bonus, 1),
      c.ct_done, c.ct_total, c.wp_done, c.wp_total, c.f_responded, c.f_total)
  ),
  CASE
    WHEN c.eff_status ILIKE 'Cancelled%' THEN 'Cancelled'
    WHEN c.stage_weight >= 95 AND c.actual_end_date IS NOT NULL AND c.planned_end_date IS NOT NULL
         AND c.actual_end_date > c.planned_end_date THEN 'Completed Late'
    WHEN c.stage_weight >= 95 THEN 'Completed On Time'
    WHEN c.planned_end_date IS NOT NULL AND c.planned_end_date < p_as_at::date THEN 'Delayed'
    WHEN c.planned_start_date IS NOT NULL AND c.planned_start_date < p_as_at::date
         AND c.actual_start_date IS NULL THEN 'At Risk'
    WHEN c.planned_end_date IS NOT NULL
         AND c.planned_end_date - p_as_at::date <= 14
         AND c.stage_weight < 65 THEN 'At Risk'
    ELSE 'On Track'
  END,
  (CASE
    WHEN c.planned_end_date IS NULL THEN NULL
    WHEN c.stage_weight >= 95 AND c.actual_end_date IS NOT NULL
      THEN (c.actual_end_date - c.planned_end_date)
    WHEN c.stage_weight < 95 AND p_as_at::date > c.planned_end_date
      THEN (p_as_at::date - c.planned_end_date)
    ELSE 0
  END)::integer,
  CASE
    WHEN c.stage_weight >= 95 THEN c.actual_end_date
    WHEN c.planned_end_date IS NOT NULL AND p_as_at::date > c.planned_end_date THEN p_as_at::date + 14
    ELSE c.planned_end_date
  END,
  (SELECT COALESCE(NULLIF(btrim(sp.display_name), ''), sp.work_email)
     FROM public.core_staff_profiles sp
    WHERE sp.id = c.lead_auditor_id OR sp.user_id = c.lead_auditor_id LIMIT 1),
  c.f_total::integer,
  c.f_ch::integer,
  c.a_open::integer,
  c.a_overdue::integer,
  c.rpt_opinion,
  c.rpt_number,
  CASE
    WHEN c.eff_status ILIKE 'Closed%' OR c.eff_status ILIKE 'Cancelled%' THEN 'None - terminal'
    WHEN c.stage_weight >= 85 THEN 'Engagement closure'
    WHEN c.stage_weight >= 65 THEN 'Issue final report'
    WHEN c.stage_weight >= 45 THEN 'Complete fieldwork and draft report'
    WHEN c.stage_weight >= 20 THEN 'Launch fieldwork'
    WHEN c.stage_weight >= 10 THEN 'Complete preparation'
    ELSE 'Schedule the engagement'
  END,
  CASE
    WHEN c.a_overdue > 0 THEN format('%s overdue corrective action(s)', c.a_overdue)
    WHEN c.planned_end_date IS NOT NULL AND c.planned_end_date < p_as_at::date
         AND c.stage_weight < 95 THEN 'Past planned end date'
    WHEN c.planned_start_date IS NOT NULL AND c.planned_start_date < p_as_at::date
         AND c.actual_start_date IS NULL THEN 'Not started after planned start'
    WHEN c.lead_auditor_id IS NULL THEN 'No lead auditor assigned'
    ELSE NULL
  END
FROM calc c
ORDER BY c.quarter NULLS LAST, c.engagement_code;
$fn$;

REVOKE ALL ON FUNCTION public.ia_engagement_status_model(uuid, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_engagement_status_model(uuid, timestamptz, uuid)
  TO authenticated, service_role;

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
  v_score  integer := 0;
  v_cap    jsonb;
  v_find   jsonb;
  v_act    jsonb;
  v_prior  jsonb;
  v_change jsonb;
  v_attn   jsonb;
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
    'in_progress', count(*) FILTER (WHERE (e ->> 'progress_pct')::int BETWEEN 20 AND 94
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Closed%'
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Cancelled%'),
    'planned_not_started', count(*) FILTER (WHERE (e ->> 'progress_pct')::int < 20
                                      AND e ->> 'lifecycle_status' NOT ILIKE 'Cancelled%'),
    'delayed_at_risk', count(*) FILTER (WHERE e ->> 'schedule_health' IN ('Delayed','At Risk')),
    'cancelled', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE 'Cancelled%'),
    'carried_forward', count(*) FILTER (WHERE e ->> 'lifecycle_status' ILIKE 'Carried Forward%'),
    'plan_completion_pct', COALESCE(round(avg((e ->> 'progress_pct')::int)), 0),
    'schedule_adherence_pct', CASE WHEN count(*) = 0 THEN 0 ELSE
        round(100.0 * count(*) FILTER (WHERE e ->> 'schedule_health'
              IN ('On Track','Completed On Time')) / count(*)) END,
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
      'severity', 'Critical', 'category', 'Overdue corrective action',
      'title', format('%s - %s overdue corrective action(s)', e ->> 'engagement_code', e ->> 'overdue_actions'),
      'link', '/audit/audits/' || (e ->> 'engagement_id') || '?tab=actions',
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id') x
    FROM jsonb_array_elements(v_rows) e WHERE (e ->> 'overdue_actions')::int > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', 'High', 'category', 'Audit significantly behind schedule',
      'title', format('%s is %s day(s) past its planned end date', e ->> 'engagement_code', e ->> 'variance_days'),
      'link', '/audit/audits/' || (e ->> 'engagement_id'),
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id')
    FROM jsonb_array_elements(v_rows) e
    WHERE e ->> 'schedule_health' = 'Delayed' AND COALESCE((e ->> 'variance_days')::int, 0) > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', 'Critical', 'category', 'Critical / High finding requiring escalation',
      'title', format('%s has %s open Critical/High finding(s)', e ->> 'engagement_code', e ->> 'findings_critical_high'),
      'link', '/audit/audits/' || (e ->> 'engagement_id') || '?tab=findings',
      'source_type', 'engagement', 'source_id', e ->> 'engagement_id')
    FROM jsonb_array_elements(v_rows) e WHERE (e ->> 'findings_critical_high')::int > 0
    UNION ALL
    SELECT jsonb_build_object(
      'severity', 'Medium', 'category', 'Resource / capacity constraint',
      'title', 'Allocated effort exceeds available audit capacity',
      'link', '/audit/audit-plans/' || p_plan_id::text || '?tab=capacity',
      'source_type', 'plan', 'source_id', p_plan_id::text)
    WHERE (v_cap ->> 'over_allocated')::boolean
  ) q;

  v_score := 0;
  IF (v_kpi ->> 'schedule_adherence_pct')::int < 90 THEN v_score := v_score + 1; END IF;
  IF (v_kpi ->> 'schedule_adherence_pct')::int < 70 THEN v_score := v_score + 1; END IF;
  IF (v_find ->> 'open_critical_high')::int > 0 THEN v_score := v_score + 1; END IF;
  IF (v_find ->> 'open_critical_high')::int > 5 THEN v_score := v_score + 1; END IF;
  IF (v_act ->> 'overdue')::int > 0 THEN v_score := v_score + 1; END IF;
  IF (v_act ->> 'overdue')::int > 10 THEN v_score := v_score + 1; END IF;
  IF (v_cap ->> 'over_allocated')::boolean THEN v_score := v_score + 1; END IF;
  v_health := CASE WHEN v_score >= 4 THEN 'RED' WHEN v_score >= 2 THEN 'AMBER' ELSE 'GREEN' END;

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
    'health', jsonb_build_object('rating', v_health, 'score', v_score,
      'basis', 'Deterministic thresholds: schedule adherence, open Critical/High findings, overdue actions, capacity.')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_management_status_live(uuid, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_management_status_live(uuid, timestamptz, text, uuid)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.ia_management_status_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number text,
  plan_id uuid NOT NULL REFERENCES public.ia_annual_plans(id),
  plan_version_number integer,
  fiscal_year text,
  reporting_period text,
  status_as_at timestamptz NOT NULL,
  audience text NOT NULL,
  department_id uuid,
  status text NOT NULL DEFAULT 'Sealed',
  snapshot jsonb NOT NULL,
  comparison_report_id uuid REFERENCES public.ia_management_status_report(id),
  comparison jsonb,
  artifact_id uuid REFERENCES public.ia_document_artifact(id),
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_msr_status_chk CHECK (status = ANY (ARRAY['Sealed','Withdrawn'])),
  CONSTRAINT ia_msr_audience_chk CHECK (audience = ANY (ARRAY[
    'HIA','Executive Management','Audit / Risk Committee','Department Management']))
);

CREATE INDEX IF NOT EXISTS ia_msr_plan_ix
  ON public.ia_management_status_report (plan_id, status_as_at DESC);

GRANT SELECT ON public.ia_management_status_report TO authenticated;
GRANT ALL ON public.ia_management_status_report TO service_role;

ALTER TABLE public.ia_management_status_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_msr_read ON public.ia_management_status_report;
CREATE POLICY ia_msr_read ON public.ia_management_status_report
  FOR SELECT TO authenticated USING (public.ia_can_view_annual_plan(plan_id));

DROP TRIGGER IF EXISTS zz_ia_msr_reference ON public.ia_management_status_report;
CREATE TRIGGER zz_ia_msr_reference
  BEFORE INSERT OR UPDATE ON public.ia_management_status_report
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard(
    'MANAGEMENT_STATUS_REPORT', 'report_number');

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
     OR NEW.comparison IS DISTINCT FROM OLD.comparison THEN
    RAISE EXCEPTION 'IA_MSR_SEALED: sealed management status report data is immutable';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zz_ia_msr_immutable ON public.ia_management_status_report;
CREATE TRIGGER zz_ia_msr_immutable
  BEFORE UPDATE OR DELETE ON public.ia_management_status_report
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_msr_immutable();

CREATE OR REPLACE FUNCTION public.ia_generate_management_status_report(
  p_plan_id uuid,
  p_audience text DEFAULT 'HIA',
  p_reporting_period text DEFAULT NULL,
  p_as_at timestamptz DEFAULT now(),
  p_department_id uuid DEFAULT NULL,
  p_compare_report_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor text := COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
  v_live  jsonb;
  v_prev  public.ia_management_status_report%ROWTYPE;
  v_cmp   jsonb := NULL;
  v_row   public.ia_management_status_report%ROWTYPE;
  v_plan  public.ia_annual_plans%ROWTYPE;
BEGIN
  IF NOT public.ia_can_view_annual_plan(p_plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;

  v_live := public.ia_management_status_live(p_plan_id, p_as_at, p_audience, p_department_id);
  IF NOT COALESCE((v_live ->> 'ok')::boolean, false) THEN
    RETURN v_live;
  END IF;

  SELECT * INTO v_plan FROM public.ia_annual_plans WHERE id = p_plan_id;

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
      'engagements_started', count(*) FILTER (
        WHERE (cur.e ->> 'progress_pct')::int >= 20 AND COALESCE((prv.e ->> 'progress_pct')::int, 0) < 20),
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
      'new_critical_high_findings',
        GREATEST(0, (v_live -> 'kpis' ->> 'findings_critical_high_open')::int
                  - COALESCE((v_prev.snapshot -> 'kpis' ->> 'findings_critical_high_open')::int, 0)),
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
          - COALESCE((v_prev.snapshot -> 'kpis' ->> 'plan_completion_pct')::int, 0)
    ) INTO v_cmp
    FROM cur LEFT JOIN prv ON prv.id = cur.id;
  END IF;

  INSERT INTO public.ia_management_status_report (
    plan_id, plan_version_number, fiscal_year, reporting_period, status_as_at,
    audience, department_id, snapshot, comparison_report_id, comparison, generated_by
  ) VALUES (
    p_plan_id, COALESCE(v_plan.current_version_number, 1), v_plan.fiscal_year,
    COALESCE(p_reporting_period, to_char(p_as_at, 'YYYY-MM')), p_as_at,
    p_audience, p_department_id, v_live, v_prev.id, v_cmp, v_actor
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'report_id', v_row.id,
    'report_number', v_row.report_number, 'comparison', v_cmp);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_attach_management_status_artifact(
  p_report_id uuid,
  p_artifact_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.ia_is_ia_user() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  UPDATE public.ia_management_status_report
     SET artifact_id = p_artifact_id
   WHERE id = p_report_id AND artifact_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_attach_management_status_artifact(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_attach_management_status_artifact(uuid, uuid)
  TO authenticated, service_role;