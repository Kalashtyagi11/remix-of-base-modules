
-- 1. N/A rationale governance ------------------------------------------------
ALTER TABLE public.ia_audit_procedures
  ADD COLUMN IF NOT EXISTS na_rationale_requirement text NOT NULL DEFAULT 'Not Required';
ALTER TABLE public.ia_engagement_programme_steps
  ADD COLUMN IF NOT EXISTS na_rationale_requirement text NOT NULL DEFAULT 'Not Required';
ALTER TABLE public.ia_control_tests
  ADD COLUMN IF NOT EXISTS na_rationale_requirement text;
ALTER TABLE public.ia_control_test_results
  ADD COLUMN IF NOT EXISTS na_rationale text;

DO $$ BEGIN
  ALTER TABLE public.ia_audit_procedures ADD CONSTRAINT ia_audit_procedures_na_req_chk
    CHECK (na_rationale_requirement IN ('Not Required','Required'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ia_engagement_programme_steps ADD CONSTRAINT ia_eps_na_req_chk
    CHECK (na_rationale_requirement IN ('Not Required','Required'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ia_control_tests ADD CONSTRAINT ia_control_tests_na_req_chk
    CHECK (na_rationale_requirement IS NULL OR na_rationale_requirement IN ('Not Required','Required'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.ia_na_rationale_requirement(p_test_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ct.na_rationale_requirement, s.na_rationale_requirement, 'Not Required')
    FROM public.ia_control_tests ct
    LEFT JOIN public.ia_engagement_programme_steps s ON s.id = ct.engagement_programme_step_id
   WHERE ct.id = p_test_id;
$$;
REVOKE ALL ON FUNCTION public.ia_na_rationale_requirement(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ia_na_rationale_requirement(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_guard_sample_na_rationale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.result = 'Not Applicable'
     AND public.ia_na_rationale_requirement(NEW.control_test_id) = 'Required'
     AND COALESCE(trim(NEW.na_rationale), '') = '' THEN
    RAISE EXCEPTION 'IA_NA_RATIONALE_REQUIRED: this procedure requires a documented reason when a sample item is marked Not Applicable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_ia_sample_na_rationale ON public.ia_control_test_results;
CREATE TRIGGER trg_ia_sample_na_rationale
  BEFORE INSERT OR UPDATE ON public.ia_control_test_results
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_sample_na_rationale();

-- 2. Practical exception dispositions ----------------------------------------
ALTER TABLE public.ia_test_exceptions
  ADD COLUMN IF NOT EXISTS further_work_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_description text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by text;

CREATE OR REPLACE FUNCTION public.ia_evaluate_test_exception(
  p_exception_id uuid, p_disposition text, p_rationale text DEFAULT NULL::text, p_finding_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_actor text := public.ia_actor_label(); v_e record; v_status text; v_further boolean;
BEGIN
  SELECT * INTO v_e FROM public.ia_test_exceptions WHERE id = p_exception_id;
  IF v_e IS NULL THEN RETURN jsonb_build_object('success', false, 'code','IA_NOT_FOUND','error','Exception not found'); END IF;
  IF NOT public.ia_cmd_guard('control_testing','edit', v_e.engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code','IA_FORBIDDEN','error','You do not have permission to evaluate this exception');
  END IF;
  IF p_disposition IS NULL OR p_disposition NOT IN
     ('Finding Raised','No Finding - Isolated','No Finding - Compensating Control','Not an Exception',
      'More Testing Required','Corrected During Fieldwork') THEN
    RETURN jsonb_build_object('success', false, 'code','IA_INVALID_DISPOSITION','error','A valid disposition is required');
  END IF;
  IF p_disposition = 'Finding Raised' AND p_finding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code','IA_FINDING_REQUIRED','error','Link the finding that this exception was raised into');
  END IF;
  IF p_disposition <> 'Finding Raised' AND COALESCE(trim(p_rationale),'') = '' THEN
    RETURN jsonb_build_object('success', false, 'code','IA_RATIONALE_REQUIRED','error','A documented rationale is required when no finding is raised');
  END IF;

  v_further := (p_disposition = 'More Testing Required');
  v_status  := CASE WHEN v_further THEN 'Further Work Required' ELSE 'Evaluated' END;

  UPDATE public.ia_test_exceptions
     SET disposition = p_disposition,
         disposition_rationale = p_rationale,
         further_work_required = v_further,
         correction_description = CASE WHEN p_disposition = 'Corrected During Fieldwork'
                                       THEN p_rationale ELSE correction_description END,
         corrected_at = CASE WHEN p_disposition = 'Corrected During Fieldwork' THEN now() ELSE corrected_at END,
         corrected_by = CASE WHEN p_disposition = 'Corrected During Fieldwork' THEN v_actor ELSE corrected_by END,
         finding_id = CASE WHEN p_disposition = 'Finding Raised' THEN p_finding_id ELSE NULL END,
         evaluation_status = v_status,
         evaluated_by = v_actor, evaluated_at = now(),
         updated_at = now(), updated_by = v_actor
   WHERE id = p_exception_id;

  PERFORM public.ia_log_event('IA.TEST_EXCEPTION.EVALUATED','test_exception', p_exception_id, v_e.engagement_id, NULL,
    jsonb_build_object('evaluation_status', v_e.evaluation_status),
    jsonb_build_object('evaluation_status', v_status,'disposition', p_disposition,'finding_id', p_finding_id),
    p_rationale, NULL, 'ia_evaluate_test_exception');

  RETURN jsonb_build_object('success', true, 'exception_id', p_exception_id, 'disposition', p_disposition,
    'evaluation_status', v_status);
END; $function$;

-- 3. Conclusion guard: open + further-work exceptions, and missing N/A reasons
CREATE OR REPLACE FUNCTION public.ia_conclude_control_test(
  p_test_id uuid, p_result text DEFAULT NULL::text, p_conclusion text DEFAULT NULL::text,
  p_no_finding_rationale text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_t record; v_actor text := public.ia_actor_label(); v_findings int;
        v_open_exc int; v_exc_total int; v_further int; v_na_missing int;
BEGIN
  SELECT * INTO v_t FROM public.ia_control_tests WHERE id = p_test_id;
  IF v_t IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'IA_NOT_FOUND', 'error', 'Control test not found'); END IF;
  IF NOT public.ia_cmd_guard('control_testing', 'edit', v_t.engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN', 'error', 'You do not have permission to conclude this control test');
  END IF;
  IF COALESCE(trim(p_conclusion), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_CONCLUSION_REQUIRED', 'error', 'A test conclusion is required');
  END IF;

  SELECT count(*) INTO v_findings FROM public.ia_findings WHERE control_test_id = p_test_id;
  SELECT count(*),
         count(*) FILTER (WHERE evaluation_status = 'Open'),
         count(*) FILTER (WHERE evaluation_status = 'Further Work Required' OR further_work_required)
    INTO v_exc_total, v_open_exc, v_further
    FROM public.ia_test_exceptions WHERE control_test_id = p_test_id;

  IF v_open_exc > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_EXCEPTIONS_UNEVALUATED',
      'error', format('%s exception(s) still require auditor evaluation before this test can be concluded', v_open_exc),
      'open_exceptions', v_open_exc);
  END IF;

  IF v_further > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FURTHER_WORK_PENDING',
      'error', format('%s exception(s) are marked "More Testing Required" — resolve the further work before concluding', v_further),
      'further_work', v_further);
  END IF;

  IF public.ia_na_rationale_requirement(p_test_id) = 'Required' THEN
    SELECT count(*) INTO v_na_missing FROM public.ia_control_test_results
      WHERE control_test_id = p_test_id AND result = 'Not Applicable'
        AND COALESCE(trim(na_rationale), '') = '';
    IF v_na_missing > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'IA_NA_RATIONALE_REQUIRED',
        'error', format('%s sample item(s) marked Not Applicable still need a documented reason', v_na_missing));
    END IF;
  END IF;

  IF COALESCE(v_t.exceptions_found, 0) > 0 AND v_exc_total = 0 AND v_findings = 0
     AND COALESCE(trim(p_no_finding_rationale), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_RATIONALE_REQUIRED',
      'error', 'Exceptions were recorded but no finding was raised — a documented rationale is required');
  END IF;

  UPDATE public.ia_control_tests
     SET result = COALESCE(p_result, result), conclusion = p_conclusion,
         no_finding_rationale = p_no_finding_rationale, status = 'Concluded',
         concluded_at = now(), concluded_by = v_actor,
         updated_at = now(), updated_by = v_actor
   WHERE id = p_test_id;

  UPDATE public.ia_engagement_programme_steps
     SET execution_status = 'Completed', updated_at = now(), updated_by = v_actor
   WHERE control_test_id = p_test_id AND execution_status <> 'Completed';

  PERFORM public.ia_log_event('IA.CONTROL_TEST.CONCLUDED', 'control_test', p_test_id, v_t.engagement_id, NULL,
    jsonb_build_object('status', v_t.status, 'result', v_t.result),
    jsonb_build_object('status', 'Concluded', 'result', p_result, 'linked_findings', v_findings, 'exceptions', v_exc_total),
    p_no_finding_rationale, NULL, 'ia_conclude_control_test');

  RETURN jsonb_build_object('success', true, 'test_id', p_test_id, 'linked_findings', v_findings, 'exceptions', v_exc_total);
END; $function$;

-- 4. Bind/approve carry the N/A requirement through the snapshot --------------
CREATE OR REPLACE FUNCTION public.ia_bind_programme_to_engagement(
  p_engagement_id uuid, p_program_id uuid, p_tailoring_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_actor text := public.ia_actor_label(); v_prog record; v_id uuid; v_count int := 0;
BEGIN
  IF NOT public.ia_cmd_guard('control_testing', 'edit', p_engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN', 'error', 'You do not have permission to plan this audit programme');
  END IF;
  SELECT * INTO v_prog FROM public.ia_audit_programs WHERE id = p_program_id;
  IF v_prog IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_NOT_FOUND', 'error', 'Audit programme not found');
  END IF;
  IF COALESCE(v_prog.status,'Draft') NOT IN ('Approved','Published') THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PROGRAMME_NOT_APPROVED', 'error', 'Only an approved or published master programme can be bound to an audit');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ia_engagement_programmes WHERE engagement_id = p_engagement_id AND status IN ('Draft','Approved')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PROGRAMME_ALREADY_BOUND', 'error', 'This audit already has a draft or approved programme');
  END IF;

  INSERT INTO public.ia_engagement_programmes (
    engagement_id, source_program_id, source_program_version, programme_name,
    objective, scope, methodology, tailoring_notes, status, snapshot, created_by, updated_by)
  VALUES (p_engagement_id, p_program_id, COALESCE(v_prog.version,1), v_prog.program_name,
    v_prog.objective, v_prog.scope, v_prog.methodology, p_tailoring_notes, 'Draft',
    to_jsonb(v_prog), v_actor, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.ia_engagement_programme_steps (
    engagement_programme_id, engagement_id, step_no, sort_order, source_procedure_id,
    source_rcm_test_id, rcm_risk_id, rcm_control_id, title, description, objective, criteria,
    test_type, sampling_method, planned_sample_size, evidence_required, expected_result,
    na_rationale_requirement, is_key, created_by, updated_by)
  SELECT v_id, p_engagement_id, pr.procedure_no, COALESCE(pr.sort_order, 0), pr.id,
         pr.rcm_test_id, pr.rcm_risk_id, pr.rcm_control_id, pr.title, pr.description, pr.objective, pr.criteria,
         pr.test_type, pr.sampling_method, pr.planned_sample_size, pr.evidence_required, pr.expected_result,
         COALESCE(pr.na_rationale_requirement, 'Not Required'),
         COALESCE(pr.is_key,false), v_actor, v_actor
    FROM public.ia_audit_procedures pr
   WHERE pr.audit_program_id = p_program_id AND COALESCE(pr.is_active, true);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.ia_log_event('IA.ENGAGEMENT_PROGRAMME.BOUND', 'engagement_programme', v_id, p_engagement_id, NULL,
    NULL, jsonb_build_object('program_id', p_program_id, 'version', v_prog.version, 'steps', v_count),
    p_tailoring_notes, NULL, 'ia_bind_programme_to_engagement');

  RETURN jsonb_build_object('success', true, 'engagement_programme_id', v_id, 'steps', v_count);
END; $function$;

CREATE OR REPLACE FUNCTION public.ia_approve_engagement_programme(p_engagement_programme_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_actor text := public.ia_actor_label(); v_ep record; v_step record; v_ct uuid; v_tests int := 0; v_steps int;
BEGIN
  SELECT * INTO v_ep FROM public.ia_engagement_programmes WHERE id = p_engagement_programme_id;
  IF v_ep IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_NOT_FOUND', 'error', 'Engagement programme not found');
  END IF;
  IF NOT public.ia_cmd_guard('control_testing', 'approve', v_ep.engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN', 'error', 'You do not have permission to approve this audit programme');
  END IF;
  IF v_ep.status <> 'Draft' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_INVALID_STATE', 'error', 'Only a draft engagement programme can be approved');
  END IF;
  SELECT count(*) INTO v_steps FROM public.ia_engagement_programme_steps WHERE engagement_programme_id = p_engagement_programme_id;
  IF v_steps = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_PROGRAMME_EMPTY', 'error', 'The programme has no steps to approve');
  END IF;

  UPDATE public.ia_engagement_programmes
     SET status = 'Approved', approved_by = v_actor, approved_at = now(), updated_by = v_actor
   WHERE id = p_engagement_programme_id;

  FOR v_step IN
    SELECT * FROM public.ia_engagement_programme_steps
     WHERE engagement_programme_id = p_engagement_programme_id AND rcm_control_id IS NOT NULL AND control_test_id IS NULL
     ORDER BY sort_order
  LOOP
    INSERT INTO public.ia_control_tests (rcm_control_id, engagement_id, engagement_programme_step_id,
      sample_size, remarks, status, is_active, na_rationale_requirement, created_by, updated_by)
    VALUES (v_step.rcm_control_id, v_ep.engagement_id, v_step.id,
      v_step.planned_sample_size, v_step.title, 'Planned', true,
      COALESCE(v_step.na_rationale_requirement, 'Not Required'), v_actor, v_actor)
    RETURNING id INTO v_ct;
    UPDATE public.ia_engagement_programme_steps SET control_test_id = v_ct, updated_by = v_actor WHERE id = v_step.id;
    v_tests := v_tests + 1;
  END LOOP;

  PERFORM public.ia_log_event('IA.ENGAGEMENT_PROGRAMME.APPROVED', 'engagement_programme', p_engagement_programme_id,
    v_ep.engagement_id, NULL, jsonb_build_object('status','Draft'),
    jsonb_build_object('status','Approved','steps',v_steps,'control_tests_created',v_tests),
    NULL, NULL, 'ia_approve_engagement_programme');

  RETURN jsonb_build_object('success', true, 'steps', v_steps, 'control_tests_created', v_tests);
END; $function$;
