CREATE OR REPLACE FUNCTION public.ia_management_status_drilldown(
  p_plan_id uuid,
  p_kpi_code text,
  p_as_at timestamptz DEFAULT now(),
  p_department_id uuid DEFAULT NULL,
  p_period_code text DEFAULT 'CURRENT',
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_report_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_k text := lower(btrim(p_kpi_code));
  v_out jsonb := '[]'::jsonb;
  v_per jsonb; v_s date; v_e date;
  v_prog jsonb; v_sched jsonb;
  v_min_pct numeric; v_max_pct numeric; v_at_risk text[];
BEGIN
  IF NOT public.ia_can_view_annual_plan(p_plan_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;

  IF p_report_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'record_type', ev.record_type, 'record_id', ev.record_id,
             'record_code', ev.record_code, 'record_label', ev.record_label,
             'attributes', ev.attributes) ORDER BY ev.record_code), '[]'::jsonb)
      INTO v_out
      FROM public.ia_management_status_report_evidence ev
     WHERE ev.report_id = p_report_id AND ev.kpi_code = v_k;
    RETURN jsonb_build_object('ok', true, 'source', 'sealed_evidence',
                              'kpi_code', v_k, 'records', v_out,
                              'count', jsonb_array_length(v_out));
  END IF;

  v_per := public.ia_management_period_bounds(p_plan_id, p_period_code, p_period_start, p_period_end, p_as_at);
  v_s := (v_per ->> 'start')::date;
  v_e := (v_per ->> 'end')::date;

  v_prog := public.ia_report_methodology_active('PROGRESS') -> 'config';
  v_sched := public.ia_report_methodology_active('SCHEDULE') -> 'config';
  v_min_pct := COALESCE((v_prog ->> 'in_progress_min_pct')::numeric, 20);
  v_max_pct := COALESCE((v_prog ->> 'in_progress_max_pct')::numeric, 95);
  SELECT COALESCE(array_agg(x), ARRAY['Delayed','At Risk'])
    INTO v_at_risk
    FROM jsonb_array_elements_text(COALESCE(v_sched -> 'at_risk_labels', '[]'::jsonb)) x;

  IF v_k IN ('approved_engagements','closed','closed_actions_pending','in_progress',
             'planned_not_started','delayed_at_risk','cancelled','carried_forward') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'record_type','engagement','record_id',(m ->> 'engagement_id')::uuid,
             'record_code', m ->> 'engagement_code',
             'record_label', m ->> 'engagement_name',
             'attributes', jsonb_build_object(
                'lifecycle_status', m ->> 'lifecycle_status',
                'schedule_health', m ->> 'schedule_health',
                'progress_pct', m ->> 'progress_pct',
                'department', m ->> 'department_name',
                'planned_end', m ->> 'planned_end',
                'link', '/audit/audits/' || (m ->> 'engagement_id')))
             ORDER BY m ->> 'engagement_code'), '[]'::jsonb)
      INTO v_out
      FROM (SELECT to_jsonb(x) m FROM public.ia_engagement_status_model(p_plan_id, p_as_at, p_department_id) x) q
     WHERE CASE v_k
        WHEN 'approved_engagements' THEN true
        WHEN 'closed' THEN (m ->> 'lifecycle_status') ILIKE 'Closed%' AND (m ->> 'lifecycle_status') NOT ILIKE '%Actions Pending%'
        WHEN 'closed_actions_pending' THEN (m ->> 'lifecycle_status') ILIKE '%Actions Pending%'
        WHEN 'in_progress' THEN (m ->> 'progress_pct')::numeric >= v_min_pct
              AND (m ->> 'progress_pct')::numeric < v_max_pct
              AND (m ->> 'lifecycle_status') NOT ILIKE 'Closed%' AND (m ->> 'lifecycle_status') NOT ILIKE 'Cancelled%'
        WHEN 'planned_not_started' THEN (m ->> 'progress_pct')::numeric < v_min_pct
              AND (m ->> 'lifecycle_status') NOT ILIKE 'Cancelled%'
        WHEN 'delayed_at_risk' THEN (m ->> 'schedule_health') = ANY (v_at_risk)
        WHEN 'cancelled' THEN (m ->> 'lifecycle_status') ILIKE 'Cancelled%'
        WHEN 'carried_forward' THEN (m ->> 'lifecycle_status') ILIKE 'Carried Forward%'
        ELSE false END;

  ELSIF v_k IN ('findings_total','open_critical_high','overdue_responses','findings_raised','findings_closed') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'record_type','finding','record_id', f.id,
             'record_code', COALESCE(f.finding_id, e.engagement_code),
             'record_label', f.title,
             'attributes', jsonb_build_object(
                'severity', COALESCE(f.severity, f.risk_rating),
                'lifecycle_status', COALESCE(f.lifecycle_status, f.status),
                'engagement', e.engagement_code,
                'department', f.department_name,
                'response_due_date', f.response_due_date,
                'raised_on', COALESCE(f.created_date, f.created_at::date),
                'link', '/audit/audits/' || e.id::text || '?tab=findings'))
             ORDER BY COALESCE(f.finding_id, '')), '[]'::jsonb)
      INTO v_out
      FROM public.ia_findings f
      JOIN public.ia_audit_engagements e ON e.id = f.engagement_id
     WHERE e.annual_plan_id = p_plan_id
       AND (p_department_id IS NULL OR e.department_id = p_department_id)
       AND CASE v_k
         WHEN 'findings_total' THEN true
         WHEN 'open_critical_high' THEN upper(COALESCE(f.severity, f.risk_rating,'')) IN ('CRITICAL','HIGH')
              AND COALESCE(f.lifecycle_status, f.status,'') NOT ILIKE '%Closed%'
         WHEN 'overdue_responses' THEN f.response_due_date IS NOT NULL AND f.response_due_date < p_as_at::date
              AND NOT EXISTS (SELECT 1 FROM public.ia_management_responses mr
                               WHERE mr.finding_id = f.id AND COALESCE(mr.is_current, true))
         WHEN 'findings_raised' THEN COALESCE(f.created_date, f.created_at::date) BETWEEN v_s AND v_e
         WHEN 'findings_closed' THEN EXISTS (
              SELECT 1 FROM public.ia_audit_event ev
               WHERE ev.entity_id = f.id AND ev.event_code = 'IA.FINDING.CLOSED'
                 AND ev.occurred_at::date BETWEEN v_s AND v_e)
         ELSE false END;

  ELSIF v_k IN ('actions_open','actions_overdue','actions_awaiting_verification','actions_verified',
                'actions_created','actions_completed') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'record_type','action','record_id', a.id,
             'record_code', COALESCE(a.action_ref, e.engagement_code),
             'record_label', a.action_description,
             'attributes', jsonb_build_object(
                'lifecycle_status', COALESCE(a.lifecycle_status, a.status),
                'owner', a.responsible_person,
                'target_date', COALESCE(a.current_target_date, a.target_date),
                'original_target_date', a.original_target_date,
                'management_completion_date', a.management_completion_date,
                'verified_at', COALESCE(a.verified_at, a.verification_date, a.verified_date),
                'engagement', e.engagement_code,
                'link', '/audit/audits/' || e.id::text || '?tab=actions'))
             ORDER BY COALESCE(a.current_target_date, a.target_date)), '[]'::jsonb)
      INTO v_out
      FROM public.ia_action_tracking a
      JOIN public.ia_audit_engagements e ON e.id = a.engagement_id
     WHERE e.annual_plan_id = p_plan_id
       AND (p_department_id IS NULL OR e.department_id = p_department_id)
       AND CASE v_k
         WHEN 'actions_open' THEN COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Closed%'
              AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Verified%'
              AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Cancelled%'
         WHEN 'actions_overdue' THEN COALESCE(a.current_target_date, a.target_date) < p_as_at::date
              AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Closed%'
              AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Verified%'
              AND COALESCE(a.lifecycle_status, a.status,'') NOT ILIKE '%Cancelled%'
         WHEN 'actions_awaiting_verification' THEN COALESCE(a.lifecycle_status, a.status,'') ILIKE '%Verification%'
              OR COALESCE(a.lifecycle_status, a.status,'') ILIKE '%Management Completed%'
         WHEN 'actions_verified' THEN COALESCE(a.lifecycle_status, a.status,'') ILIKE '%Verified%'
              OR COALESCE(a.lifecycle_status, a.status,'') ILIKE '%Closed%'
         WHEN 'actions_created' THEN a.created_at::date BETWEEN v_s AND v_e
         WHEN 'actions_completed' THEN a.management_completion_date::date BETWEEN v_s AND v_e
         ELSE false END;

  ELSIF v_k IN ('universe_high_risk_unscheduled','universe_overdue_by_frequency') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'record_type','universe_entity','record_id', u.id,
             'record_code', u.entity_code, 'record_label', u.entity_name,
             'attributes', jsonb_build_object(
                'risk_category', u.risk_category,
                'residual_risk_score', u.residual_risk_score,
                'audit_frequency', u.audit_frequency,
                'last_audit_date', u.last_audit_date,
                'next_audit_due', u.next_audit_due,
                'link', '/audit/audit-universe'))
             ORDER BY u.entity_code), '[]'::jsonb)
      INTO v_out
      FROM public.ia_audit_universe u
     WHERE COALESCE(u.is_active, true)
       AND (p_department_id IS NULL OR u.department_id = p_department_id)
       AND CASE v_k
         WHEN 'universe_high_risk_unscheduled' THEN
              upper(COALESCE(u.risk_category,'')) IN ('CRITICAL','HIGH')
              AND NOT EXISTS (SELECT 1 FROM public.ia_audit_engagements e
                               WHERE e.annual_plan_id = p_plan_id
                                 AND (e.function_id = u.function_id OR e.department_id = u.department_id)
                                 AND COALESCE(e.status,'') NOT ILIKE 'Cancelled%')
         WHEN 'universe_overdue_by_frequency' THEN
              u.next_audit_due IS NOT NULL AND u.next_audit_due < p_as_at::date
              AND NOT EXISTS (SELECT 1 FROM public.ia_audit_engagements e
                               WHERE (e.function_id = u.function_id OR e.department_id = u.department_id)
                                 AND COALESCE(e.closure_date, e.actual_end_date) >= u.next_audit_due)
         ELSE false END;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'kpi_not_drillable', 'kpi_code', v_k);
  END IF;

  RETURN jsonb_build_object('ok', true, 'source', 'live', 'kpi_code', v_k,
                            'period', v_per, 'records', v_out,
                            'count', jsonb_array_length(v_out));
END;
$function$;

REVOKE ALL ON FUNCTION public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid) TO authenticated, service_role;