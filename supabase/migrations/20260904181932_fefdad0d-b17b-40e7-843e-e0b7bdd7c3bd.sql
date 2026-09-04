-- INTERNAL AUDIT — Management Reporting V2: period movement, completed-audit
-- summaries, cross-audit themes, assurance coverage, forecast, temporal fidelity.
-- Additive: reuses the single canonical engine ia_management_status_live().

CREATE TABLE IF NOT EXISTS public.ia_finding_theme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_code text NOT NULL UNIQUE,
  theme_name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ia_finding_theme TO authenticated;
GRANT ALL ON public.ia_finding_theme TO service_role;
ALTER TABLE public.ia_finding_theme ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_finding_theme_read ON public.ia_finding_theme;
CREATE POLICY ia_finding_theme_read ON public.ia_finding_theme
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

INSERT INTO public.ia_finding_theme (theme_code, theme_name, keywords, sort_order)
VALUES
  ('ACCESS_CONTROL','Access Control', ARRAY['access','user account','privilege','password','login','permission'],10),
  ('SOD','Segregation of Duties', ARRAY['segregation','sod','conflicting duties','same person'],20),
  ('APPROVAL','Approval / Authorization', ARRAY['approval','authoris','authoriz','sign-off','sign off','delegation'],30),
  ('DOCUMENTATION','Documentation', ARRAY['documentation','not documented','missing document','record keeping','incomplete file'],40),
  ('RECONCILIATION','Reconciliation', ARRAY['reconcil','unreconciled','variance','suspense'],50),
  ('DATA_QUALITY','Data Quality', ARRAY['data quality','inaccurate','incomplete data','duplicate record','integrity'],60),
  ('IT_SECURITY','IT Security', ARRAY['it security','cyber','encryption','patch','backup','vulnerab','audit trail'],70),
  ('POLICY','Policy Compliance', ARRAY['policy','procedure','regulation','statutory','non-compliance','noncompliance'],80),
  ('PROCUREMENT','Procurement', ARRAY['procure','tender','vendor','supplier','contract'],90),
  ('BCP','Business Continuity', ARRAY['continuity','disaster recovery','bcp','resilience'],100)
ON CONFLICT (theme_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ia_management_period_bounds(
  p_plan_id uuid,
  p_period_code text DEFAULT 'CURRENT',
  p_custom_start date DEFAULT NULL,
  p_custom_end date DEFAULT NULL,
  p_as_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_plan public.ia_annual_plans%ROWTYPE;
  v_fy   public.core_fiscal_year%ROWTYPE;
  v_s date; v_e date; v_label text; v_code text := upper(COALESCE(p_period_code,'CURRENT'));
BEGIN
  SELECT * INTO v_plan FROM public.ia_annual_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code','plan_not_found'); END IF;

  IF v_plan.fiscal_year_id IS NOT NULL THEN
    SELECT * INTO v_fy FROM public.core_fiscal_year WHERE id = v_plan.fiscal_year_id;
  END IF;
  IF v_fy.id IS NULL THEN
    SELECT * INTO v_fy FROM public.core_fiscal_year
     WHERE code = v_plan.fiscal_year OR display_name = v_plan.fiscal_year LIMIT 1;
  END IF;

  IF v_fy.id IS NULL THEN
    v_fy.start_date := COALESCE(v_plan.planned_start_date, date_trunc('year', p_as_at)::date);
    v_fy.end_date   := COALESCE(v_plan.planned_end_date, (date_trunc('year', p_as_at) + interval '1 year - 1 day')::date);
    v_fy.display_name := v_plan.fiscal_year;
  END IF;

  IF v_code IN ('Q1','Q2','Q3','Q4') THEN
    v_s := (v_fy.start_date + ((substr(v_code,2,1)::int - 1) * interval '3 months'))::date;
    v_e := (v_s + interval '3 months - 1 day')::date;
    v_label := format('%s %s (%s to %s)', v_code, COALESCE(v_fy.display_name, v_plan.fiscal_year, ''),
                      to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSIF v_code = 'MONTH' THEN
    v_s := date_trunc('month', p_as_at)::date;
    v_e := (date_trunc('month', p_as_at) + interval '1 month - 1 day')::date;
    v_label := format('Month %s', to_char(v_s,'Mon YYYY'));
  ELSIF v_code = 'YTD' THEN
    v_s := v_fy.start_date;
    v_e := LEAST(p_as_at::date, v_fy.end_date);
    v_label := format('Year to date (%s to %s)', to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSIF v_code = 'CUSTOM' THEN
    v_s := COALESCE(p_custom_start, v_fy.start_date);
    v_e := COALESCE(p_custom_end, p_as_at::date);
    v_label := format('Custom period (%s to %s)', to_char(v_s,'DD Mon YYYY'), to_char(v_e,'DD Mon YYYY'));
  ELSE
    v_code := 'CURRENT';
    v_s := v_fy.start_date;
    v_e := LEAST(p_as_at::date, v_fy.end_date);
    v_label := format('Current status (plan year to %s)', to_char(v_e,'DD Mon YYYY'));
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'label', v_label,
    'start', v_s, 'end', v_e,
    'fiscal_year', COALESCE(v_fy.display_name, v_plan.fiscal_year),
    'fiscal_start', v_fy.start_date, 'fiscal_end', v_fy.end_date);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_management_period_bounds(uuid, text, date, date, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_management_period_bounds(uuid, text, date, date, timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_management_status_live_v2(
  p_plan_id uuid,
  p_as_at timestamptz DEFAULT now(),
  p_audience text DEFAULT 'HIA',
  p_department_id uuid DEFAULT NULL,
  p_period_code text DEFAULT 'CURRENT',
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_base jsonb;
  v_per  jsonb;
  v_s date; v_e date;
  v_move jsonb; v_completed jsonb; v_themes jsonb; v_cov jsonb; v_fc jsonb;
  v_rows jsonb;
BEGIN
  v_base := public.ia_management_status_live(p_plan_id, p_as_at, p_audience, p_department_id);
  IF NOT COALESCE((v_base ->> 'ok')::boolean, false) THEN RETURN v_base; END IF;

  v_per := public.ia_management_period_bounds(p_plan_id, p_period_code, p_period_start, p_period_end, p_as_at);
  v_s := (v_per ->> 'start')::date;
  v_e := (v_per ->> 'end')::date;
  v_rows := v_base -> 'engagements';

  SELECT jsonb_build_object(
    'audits_started', count(*) FILTER (WHERE e.actual_start_date BETWEEN v_s AND v_e),
    'audits_completed', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) BETWEEN v_s AND v_e
        AND COALESCE(e.status,'') NOT ILIKE 'Cancelled%'),
    'audits_closed_actions_pending', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) BETWEEN v_s AND v_e
        AND COALESCE(e.status,'') ILIKE '%Actions Pending%'),
    'audits_delayed', count(*) FILTER (WHERE e.planned_end_date BETWEEN v_s AND v_e
        AND (e.actual_end_date IS NULL OR e.actual_end_date > e.planned_end_date)),
    'audits_cancelled', count(*) FILTER (WHERE COALESCE(e.status,'') ILIKE 'Cancelled%'
        AND e.updated_at::date BETWEEN v_s AND v_e),
    'audits_carried_forward', count(*) FILTER (WHERE COALESCE(e.status,'') ILIKE 'Carried Forward%'
        AND e.updated_at::date BETWEEN v_s AND v_e),
    'audits_in_progress_at_period_end', count(*) FILTER (WHERE e.actual_start_date IS NOT NULL
        AND e.actual_start_date <= v_e
        AND (COALESCE(e.closure_date, e.actual_end_date) IS NULL OR COALESCE(e.closure_date, e.actual_end_date) > v_e))
  ) INTO v_move
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move
    || jsonb_build_object(
      'findings_raised', count(*) FILTER (WHERE COALESCE(f.created_date, f.created_at)::date BETWEEN v_s AND v_e),
      'findings_critical_high_raised', count(*) FILTER (WHERE COALESCE(f.created_date, f.created_at)::date BETWEEN v_s AND v_e
          AND upper(COALESCE(f.severity, f.risk_rating,'')) IN ('CRITICAL','HIGH')),
      'findings_closed', count(*) FILTER (WHERE COALESCE(f.lifecycle_status, f.status,'') ILIKE '%Closed%'
          AND f.updated_at::date BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_findings f
  JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'management_responses_received', count(*) FILTER (
        WHERE COALESCE(mr.submitted_date, mr.created_at)::date BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_management_responses mr
  JOIN public.ia_findings f ON f.id = mr.finding_id
  JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT v_move || jsonb_build_object(
      'actions_created', count(*) FILTER (WHERE a.created_at::date BETWEEN v_s AND v_e),
      'actions_completed', count(*) FILTER (WHERE a.management_completion_date::date BETWEEN v_s AND v_e),
      'actions_verified', count(*) FILTER (WHERE COALESCE(a.verified_at, a.verification_date, a.verified_date)::date BETWEEN v_s AND v_e),
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
        WHERE COALESCE(pa.status,'') ILIKE '%Approv%' AND COALESCE(pa.updated_at, pa.created_at)::date BETWEEN v_s AND v_e))
  INTO v_move
  FROM public.ia_plan_amendments pa WHERE pa.plan_id = p_plan_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'completed_on'), '[]'::jsonb) INTO v_completed
  FROM (
    SELECT jsonb_build_object(
      'engagement_id', e.id,
      'engagement_code', e.engagement_code,
      'title', e.engagement_name,
      'department', (SELECT d.name FROM public.ia_departments d WHERE d.id = e.department_id),
      'function_id', e.function_id,
      'audit_type', e.engagement_type,
      'risk_rating', e.engagement_risk_rating,
      'objectives', e.objectives,
      'scope', e.scope,
      'planned_start', e.planned_start_date,
      'planned_end', e.planned_end_date,
      'actual_start', e.actual_start_date,
      'actual_end', e.actual_end_date,
      'completed_on', COALESCE(e.closure_date, e.actual_end_date),
      'lead_auditor', (SELECT COALESCE(NULLIF(btrim(sp.display_name),''), sp.work_email)
                         FROM public.core_staff_profiles sp
                        WHERE sp.id = e.lead_auditor_id OR sp.user_id = e.lead_auditor_id LIMIT 1),
      'disposition', COALESCE(e.execution_status, e.status),
      'report_id', r.id,
      'report_number', r.report_number,
      'report_issued_at', COALESCE(r.issued_at, r.approved_on),
      'audit_opinion', COALESCE(r.overall_assessment, r.risk_rating),
      'conclusion', r.conclusion,
      'executive_summary', COALESCE(r.executive_summary, r.key_highlights),
      'report_objective', r.audit_objective,
      'report_scope', r.audit_scope,
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
       ORDER BY COALESCE(r2.issued_at, r2.created_at) DESC LIMIT 1) r ON true
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
      AND EXISTS (SELECT 1 FROM unnest(t.keywords) k
                   WHERE lower(COALESCE(f.title,'') || ' ' || COALESCE(f.condition,'') || ' ' ||
                               COALESCE(f.root_cause_category,'') || ' ' || COALESCE(f.impact_area,'')) LIKE '%' || k || '%')
  ) m ON m.cnt > 0
  WHERE t.is_active;

  SELECT jsonb_build_object(
    'planned_total', count(*),
    'completed_total', count(*) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'critical_planned', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'CRITICAL'),
    'critical_completed', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'CRITICAL'
        AND COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'high_planned', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'HIGH'),
    'high_completed', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) = 'HIGH'
        AND COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'deferred_high_risk', count(*) FILTER (WHERE upper(COALESCE(e.engagement_risk_rating,'')) IN ('CRITICAL','HIGH')
        AND (COALESCE(e.status,'') ILIKE 'Cancelled%' OR COALESCE(e.status,'') ILIKE 'Carried Forward%')),
    'departments_planned', count(DISTINCT e.department_id),
    'departments_covered', count(DISTINCT e.department_id) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL),
    'functions_planned', count(DISTINCT e.function_id),
    'functions_covered', count(DISTINCT e.function_id) FILTER (WHERE COALESCE(e.closure_date, e.actual_end_date) IS NOT NULL)
  ) INTO v_cov
  FROM public.ia_audit_engagements e
  WHERE e.annual_plan_id = p_plan_id
    AND (p_department_id IS NULL OR e.department_id = p_department_id);

  SELECT jsonb_build_object(
    'basis', 'Deterministic: engagements are forecast from current lifecycle progress, planned end dates against fiscal year end, open actions and current schedule health. No statistical estimation is applied.',
    'fiscal_year_end', (v_per ->> 'fiscal_end'),
    'expected_completion_pct', CASE WHEN count(*) = 0 THEN 0 ELSE
        round(100.0 * count(*) FILTER (WHERE (e ->> 'progress_pct')::int >= 95
          OR ((e ->> 'planned_end') IS NOT NULL AND (e ->> 'planned_end')::date <= (v_per ->> 'fiscal_end')::date
              AND (e ->> 'schedule_health') <> 'Delayed')) / count(*))::int END,
    'likely_to_close', count(*) FILTER (WHERE (e ->> 'progress_pct')::int BETWEEN 65 AND 94
        AND (e ->> 'schedule_health') <> 'Delayed'),
    'likely_actions_pending', count(*) FILTER (WHERE (e ->> 'open_actions')::int > 0),
    'at_risk_of_delay', count(*) FILTER (WHERE (e ->> 'schedule_health') IN ('At Risk','Delayed')),
    'likely_carry_forward', count(*) FILTER (WHERE (e ->> 'schedule_health') = 'Delayed'
        AND (e ->> 'progress_pct')::int < 45),
    'capacity_constrained', COALESCE((v_base -> 'capacity' ->> 'over_allocated')::boolean, false),
    'management_response_delay', (SELECT count(*) FROM public.ia_findings f
        JOIN public.ia_audit_engagements ae ON ae.id = f.engagement_id
       WHERE ae.annual_plan_id = p_plan_id AND f.response_due_date < p_as_at::date
         AND NOT EXISTS (SELECT 1 FROM public.ia_management_responses mr WHERE mr.finding_id = f.id))
  ) INTO v_fc
  FROM jsonb_array_elements(v_rows) e;

  RETURN v_base || jsonb_build_object(
    'version', 2,
    'period', v_per,
    'period_movement', COALESCE(v_move, '{}'::jsonb),
    'completed_audits', v_completed,
    'themes', v_themes,
    'coverage', v_cov,
    'forecast', COALESCE(v_fc, '{}'::jsonb),
    'temporal_fidelity', jsonb_build_object(
      'as_at_is_historical', (p_as_at::date < current_date),
      'reconstructed', jsonb_build_array(
        'Period movement (dated business events: starts, completions, findings raised, responses, actions, follow-ups, amendments)',
        'Completed audits during the period',
        'Action overdue evaluation against the As At date'),
      'current_state_only', jsonb_build_array(
        'Engagement lifecycle status and progress',
        'Finding lifecycle status and severity',
        'Action lifecycle status',
        'Plan status and version'),
      'limitation', 'Cumulative lifecycle status is evaluated from current records. Only dated business events are reconstructed for a historical As At date. For an authoritative historical position use the sealed IA-MSR snapshot generated at that time.')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_management_status_live_v2(uuid, timestamptz, text, uuid, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_management_status_live_v2(uuid, timestamptz, text, uuid, text, date, date)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid);

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
BEGIN
  IF NOT public.ia_can_view_annual_plan(p_plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;

  v_live := public.ia_management_status_live_v2(p_plan_id, p_as_at, p_audience, p_department_id,
                                                p_period_code, p_period_start, p_period_end);
  IF NOT COALESCE((v_live ->> 'ok')::boolean, false) THEN RETURN v_live; END IF;
  v_live := v_live || jsonb_build_object('report_mode', p_report_mode);

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
      'forecast_completion_delta',
        COALESCE((v_live -> 'forecast' ->> 'expected_completion_pct')::int, 0)
          - COALESCE((v_prev.snapshot -> 'forecast' ->> 'expected_completion_pct')::int, 0)
    ) INTO v_cmp
    FROM cur LEFT JOIN prv ON prv.id = cur.id;
  END IF;

  INSERT INTO public.ia_management_status_report (
    plan_id, plan_version_number, fiscal_year, reporting_period, status_as_at,
    audience, department_id, snapshot, comparison_report_id, comparison, generated_by
  ) VALUES (
    p_plan_id, COALESCE(v_plan.current_version_number, 1), v_plan.fiscal_year,
    COALESCE(p_reporting_period, v_live -> 'period' ->> 'label'), p_as_at,
    p_audience, p_department_id, v_live, v_prev.id, v_cmp,
    COALESCE(auth.jwt() ->> 'email', auth.uid()::text)
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'report_id', v_row.id, 'report_number', v_row.report_number);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_generate_management_status_report(uuid, text, text, timestamptz, uuid, uuid, text, date, date, text)
  TO authenticated, service_role;