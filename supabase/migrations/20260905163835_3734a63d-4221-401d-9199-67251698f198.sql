-- ============ A. SAMPLE ITEM EXECUTION ============
ALTER TABLE public.ia_control_test_results
  ADD COLUMN IF NOT EXISTS engagement_programme_step_id uuid REFERENCES public.ia_engagement_programme_steps(id),
  ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES public.ia_audit_engagements(id),
  ADD COLUMN IF NOT EXISTS tested_by text,
  ADD COLUMN IF NOT EXISTS tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS conclusion text,
  ADD COLUMN IF NOT EXISTS evidence_id uuid REFERENCES public.ia_evidence(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;

CREATE INDEX IF NOT EXISTS idx_ia_ctr_test ON public.ia_control_test_results(control_test_id);

-- Derive sample size / exception count from executed sample items
CREATE OR REPLACE FUNCTION public.ia_sync_control_test_sample_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_test uuid; v_items int; v_exc int;
BEGIN
  v_test := COALESCE(NEW.control_test_id, OLD.control_test_id);
  IF v_test IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT count(*), count(*) FILTER (WHERE lower(COALESCE(result,'')) IN ('exception','fail','failed','deviation'))
    INTO v_items, v_exc
    FROM public.ia_control_test_results WHERE control_test_id = v_test;
  IF v_items > 0 THEN
    UPDATE public.ia_control_tests
       SET sample_size = v_items, exceptions_found = v_exc, updated_at = now()
     WHERE id = v_test;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_ia_ctr_sample_metrics ON public.ia_control_test_results;
CREATE TRIGGER trg_ia_ctr_sample_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.ia_control_test_results
  FOR EACH ROW EXECUTE FUNCTION public.ia_sync_control_test_sample_metrics();

-- ============ B. LIGHTWEIGHT EXCEPTION / POTENTIAL FINDING ============
CREATE TABLE IF NOT EXISTS public.ia_test_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_no text,
  engagement_id uuid NOT NULL REFERENCES public.ia_audit_engagements(id) ON DELETE CASCADE,
  control_test_id uuid REFERENCES public.ia_control_tests(id) ON DELETE CASCADE,
  sample_result_id uuid REFERENCES public.ia_control_test_results(id) ON DELETE SET NULL,
  engagement_programme_step_id uuid REFERENCES public.ia_engagement_programme_steps(id) ON DELETE SET NULL,
  condition text NOT NULL,
  criteria text,
  severity text NOT NULL DEFAULT 'Medium',
  evaluation_status text NOT NULL DEFAULT 'Open',
  disposition text,
  disposition_rationale text,
  finding_id uuid REFERENCES public.ia_findings(id),
  evaluated_by text,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT ia_test_exceptions_sev_chk CHECK (severity IN ('Low','Medium','High')),
  CONSTRAINT ia_test_exceptions_eval_chk CHECK (evaluation_status IN ('Open','Evaluated')),
  CONSTRAINT ia_test_exceptions_disp_chk CHECK (disposition IS NULL OR disposition IN
    ('Finding Raised','No Finding - Isolated','No Finding - Compensating Control','Not an Exception'))
);
CREATE INDEX IF NOT EXISTS idx_ia_test_exceptions_eng ON public.ia_test_exceptions(engagement_id);
CREATE INDEX IF NOT EXISTS idx_ia_test_exceptions_test ON public.ia_test_exceptions(control_test_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_test_exceptions TO authenticated;
GRANT ALL ON public.ia_test_exceptions TO service_role;
ALTER TABLE public.ia_test_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_w1_read ON public.ia_test_exceptions;
CREATE POLICY ia_w1_read ON public.ia_test_exceptions FOR SELECT TO authenticated
  USING (public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_insert ON public.ia_test_exceptions;
CREATE POLICY ia_w1_insert ON public.ia_test_exceptions FOR INSERT TO authenticated
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_update ON public.ia_test_exceptions;
CREATE POLICY ia_w1_update ON public.ia_test_exceptions FOR UPDATE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id))
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_delete ON public.ia_test_exceptions;
CREATE POLICY ia_w1_delete ON public.ia_test_exceptions FOR DELETE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));

-- Evaluation is a governed command; a finding is never auto-created
CREATE OR REPLACE FUNCTION public.ia_evaluate_test_exception(
  p_exception_id uuid, p_disposition text, p_rationale text DEFAULT NULL, p_finding_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.ia_actor_label(); v_e record;
BEGIN
  SELECT * INTO v_e FROM public.ia_test_exceptions WHERE id = p_exception_id;
  IF v_e IS NULL THEN RETURN jsonb_build_object('success', false, 'code','IA_NOT_FOUND','error','Exception not found'); END IF;
  IF NOT public.ia_cmd_guard('control_testing','edit', v_e.engagement_id) THEN
    RETURN jsonb_build_object('success', false, 'code','IA_FORBIDDEN','error','You do not have permission to evaluate this exception');
  END IF;
  IF p_disposition IS NULL OR p_disposition NOT IN
     ('Finding Raised','No Finding - Isolated','No Finding - Compensating Control','Not an Exception') THEN
    RETURN jsonb_build_object('success', false, 'code','IA_INVALID_DISPOSITION','error','A valid disposition is required');
  END IF;
  IF p_disposition = 'Finding Raised' AND p_finding_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code','IA_FINDING_REQUIRED','error','Link the finding that this exception was raised into');
  END IF;
  IF p_disposition <> 'Finding Raised' AND COALESCE(trim(p_rationale),'') = '' THEN
    RETURN jsonb_build_object('success', false, 'code','IA_RATIONALE_REQUIRED','error','A documented rationale is required when no finding is raised');
  END IF;

  UPDATE public.ia_test_exceptions
     SET disposition = p_disposition, disposition_rationale = p_rationale,
         finding_id = CASE WHEN p_disposition = 'Finding Raised' THEN p_finding_id ELSE NULL END,
         evaluation_status = 'Evaluated', evaluated_by = v_actor, evaluated_at = now(),
         updated_at = now(), updated_by = v_actor
   WHERE id = p_exception_id;

  PERFORM public.ia_log_event('IA.TEST_EXCEPTION.EVALUATED','test_exception', p_exception_id, v_e.engagement_id, NULL,
    jsonb_build_object('evaluation_status', v_e.evaluation_status),
    jsonb_build_object('evaluation_status','Evaluated','disposition', p_disposition,'finding_id', p_finding_id),
    p_rationale, NULL, 'ia_evaluate_test_exception');

  RETURN jsonb_build_object('success', true, 'exception_id', p_exception_id, 'disposition', p_disposition);
END; $$;
GRANT EXECUTE ON FUNCTION public.ia_evaluate_test_exception(uuid, text, text, uuid) TO authenticated;

-- Conclusion guard extended: unevaluated exceptions block conclusion
CREATE OR REPLACE FUNCTION public.ia_conclude_control_test(
  p_test_id uuid, p_result text DEFAULT NULL, p_conclusion text DEFAULT NULL, p_no_finding_rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t record; v_actor text := public.ia_actor_label(); v_findings int; v_open_exc int; v_exc_total int;
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
  SELECT count(*), count(*) FILTER (WHERE evaluation_status = 'Open')
    INTO v_exc_total, v_open_exc FROM public.ia_test_exceptions WHERE control_test_id = p_test_id;

  IF v_open_exc > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_EXCEPTIONS_UNEVALUATED',
      'error', format('%s exception(s) still require auditor evaluation before this test can be concluded', v_open_exc),
      'open_exceptions', v_open_exc);
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
END; $$;

-- ============ C. EVIDENCE LINKAGE + INTEGRITY ============
ALTER TABLE public.ia_evidence
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS hash_algorithm text;

CREATE TABLE IF NOT EXISTS public.ia_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.ia_evidence(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.ia_audit_engagements(id) ON DELETE CASCADE,
  linked_type text NOT NULL,
  linked_id uuid NOT NULL,
  link_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT ia_evidence_links_type_chk CHECK (linked_type IN
    ('programme_step','control_test','sample_item','exception','finding','working_paper','activity')),
  CONSTRAINT uq_ia_evidence_link UNIQUE (evidence_id, linked_type, linked_id)
);
CREATE INDEX IF NOT EXISTS idx_ia_evidence_links_target ON public.ia_evidence_links(linked_type, linked_id);
CREATE INDEX IF NOT EXISTS idx_ia_evidence_links_eng ON public.ia_evidence_links(engagement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_evidence_links TO authenticated;
GRANT ALL ON public.ia_evidence_links TO service_role;
ALTER TABLE public.ia_evidence_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_w1_read ON public.ia_evidence_links;
CREATE POLICY ia_w1_read ON public.ia_evidence_links FOR SELECT TO authenticated
  USING (public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_insert ON public.ia_evidence_links;
CREATE POLICY ia_w1_insert ON public.ia_evidence_links FOR INSERT TO authenticated
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_update ON public.ia_evidence_links;
CREATE POLICY ia_w1_update ON public.ia_evidence_links FOR UPDATE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id))
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_delete ON public.ia_evidence_links;
CREATE POLICY ia_w1_delete ON public.ia_evidence_links FOR DELETE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));