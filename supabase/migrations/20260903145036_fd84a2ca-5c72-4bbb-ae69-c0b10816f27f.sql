CREATE OR REPLACE FUNCTION public.ia_update_annual_plan_working_copy(p_plan_id uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_allowed text[] := ARRAY[
    'title','fiscal_year','fiscal_year_id','plan_owner','prepared_by','objective','scope','scope_description',
    'audit_scope','exclusions','methodology','methodology_notes','planning_assumptions',
    'risk_level','planned_start_date','planned_end_date','planned_hours','monthly_working_hours',
    'total_available_hours','auditor_count','buffer_pct','contingency_hours','utilization_pct',
    'resource_constraints','skills_constraints','outsourced_support_notes','executive_summary',
    'department_id','function_id','board_committee_name','assigned_auditor','total_department_audits'
  ];
  v_lifecycle text[] := ARRAY[
    'status','submitted_by','submitted_date','approved_by','approved_date','current_version_number',
    'workflow_instance_id','is_locked','closed_by','closed_date','closure_summary',
    'current_workflow_step','rejected_by','rejected_at','revision_count','approval_comments'
  ];
  v_plan record;
  v_actor text;
  v_key text;
  v_rejected text[] := ARRAY[]::text[];
  v_sets text[] := ARRAY[]::text[];
  v_sql text;
  v_row jsonb;
  v_fy_id uuid;
  v_fy record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ia_actor_can('audit_plans', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PERMISSION_DENIED',
      'error', 'You do not have permission to modify this annual plan.');
  END IF;

  v_actor := COALESCE(NULLIF(trim(COALESCE(public.ia_actor_label(), '')), ''), auth.uid()::text);

  SELECT * INTO v_plan FROM ia_annual_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PLAN_NOT_FOUND', 'error', 'Plan not found');
  END IF;
  IF NOT (COALESCE(v_plan.status, 'Draft') = ANY (public.ia_plan_working_copy_statuses())) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PLAN_NOT_EDITABLE',
      'error', 'Plan details can only be edited while the plan is a working copy (Draft, Rejected, Changes Requested or Amendment Pending). Current status: ' || v_plan.status);
  END IF;

  -- Fiscal year master validation (Stage 2A): only open/active fiscal years may be selected.
  IF p_changes ? 'fiscal_year_id' AND NULLIF(p_changes->>'fiscal_year_id','') IS NOT NULL THEN
    v_fy_id := (p_changes->>'fiscal_year_id')::uuid;
    SELECT * INTO v_fy FROM public.core_fiscal_year WHERE id = v_fy_id;
    IF v_fy.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'IA_FISCAL_YEAR_NOT_FOUND',
        'error', 'The selected fiscal year does not exist in the fiscal calendar master.');
    END IF;
    IF COALESCE(v_fy.status,'') = 'Closed' THEN
      RETURN jsonb_build_object('success', false, 'code', 'IA_FISCAL_YEAR_CLOSED',
        'error', 'The selected fiscal year is closed and cannot be assigned to a plan.');
    END IF;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb))
  LOOP
    IF v_key = ANY (v_lifecycle) THEN
      v_rejected := v_rejected || v_key;
    ELSIF v_key = ANY (v_allowed) THEN
      v_sets := v_sets || format('%I = NULLIF($1->>%L, '''')::%s', v_key, v_key,
        (SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ia_annual_plans' AND column_name = v_key));
    ELSIF v_key <> 'id' THEN
      v_rejected := v_rejected || v_key;
    END IF;
  END LOOP;

  IF array_length(v_rejected, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FIELD_NOT_EDITABLE',
      'error', 'These fields cannot be changed through a normal plan content update: ' || array_to_string(v_rejected, ', '),
      'rejected_fields', to_jsonb(v_rejected));
  END IF;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_NO_CHANGES', 'error', 'No editable changes supplied.');
  END IF;

  v_sql := 'UPDATE ia_annual_plans SET ' || array_to_string(v_sets, ', ')
        || format(', updated_at = now(), updated_by = %L WHERE id = %L RETURNING to_jsonb(ia_annual_plans)', v_actor, p_plan_id);

  EXECUTE v_sql INTO v_row USING p_changes;

  INSERT INTO ia_plan_change_log (plan_id, change_type, description, changed_by)
  VALUES (p_plan_id, 'plan_details_updated',
    'Plan details updated: ' || array_to_string(ARRAY(SELECT jsonb_object_keys(p_changes)), ', '), v_actor);

  PERFORM public.ia_log_event('PLAN_DETAILS_UPDATED', 'ia_annual_plan', p_plan_id, NULL, p_plan_id,
    to_jsonb(v_plan), v_row, NULL, NULL, 'ia_update_annual_plan_working_copy');

  RETURN jsonb_build_object('success', true, 'plan', v_row, 'actor', v_actor);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ia_update_annual_plan_working_copy(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_update_annual_plan_working_copy(uuid, jsonb) TO authenticated, service_role;