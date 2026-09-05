-- ============ A. MASTER PROGRAMME GOVERNANCE ============
ALTER TABLE public.ia_audit_programs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_program_id uuid REFERENCES public.ia_audit_programs(id),
  ADD COLUMN IF NOT EXISTS version_notes text;

ALTER TABLE public.ia_audit_procedures
  ADD COLUMN IF NOT EXISTS rcm_control_id uuid REFERENCES public.ia_rcm_controls(id),
  ADD COLUMN IF NOT EXISTS rcm_risk_id uuid REFERENCES public.ia_rcm_risks(id),
  ADD COLUMN IF NOT EXISTS rcm_test_id uuid REFERENCES public.ia_rcm_tests(id),
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS criteria text,
  ADD COLUMN IF NOT EXISTS sampling_method text,
  ADD COLUMN IF NOT EXISTS planned_sample_size integer,
  ADD COLUMN IF NOT EXISTS is_key boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ia_rcm_tests
  ADD COLUMN IF NOT EXISTS test_name text,
  ADD COLUMN IF NOT EXISTS test_type text,
  ADD COLUMN IF NOT EXISTS sampling_method text,
  ADD COLUMN IF NOT EXISTS default_sample_size integer,
  ADD COLUMN IF NOT EXISTS criteria text,
  ADD COLUMN IF NOT EXISTS evidence_required text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Master immutability: approved/published programmes are frozen
CREATE OR REPLACE FUNCTION public.ia_guard_program_master_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_k text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.status,'Draft') <> 'Draft' THEN
      RAISE EXCEPTION 'IA_PROGRAMME_FROZEN: programme % is % and cannot be deleted', OLD.id, OLD.status;
    END IF;
    RETURN OLD;
  END IF;
  IF COALESCE(OLD.status,'Draft') IN ('Approved','Published','Retired','Superseded') THEN
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    FOR v_k IN SELECT jsonb_object_keys(v_old) LOOP
      IF v_k NOT IN ('status','retired_at','published_at','approved_at','approved_by','is_active','updated_at','updated_by','version_notes')
         AND v_old->v_k IS DISTINCT FROM v_new->v_k THEN
        RAISE EXCEPTION 'IA_PROGRAMME_FROZEN: programme % is % — field "%" cannot be changed. Create a new version instead.', OLD.id, OLD.status, v_k;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ia_program_master_immutability ON public.ia_audit_programs;
CREATE TRIGGER trg_ia_program_master_immutability
  BEFORE UPDATE OR DELETE ON public.ia_audit_programs
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_program_master_immutability();

CREATE OR REPLACE FUNCTION public.ia_guard_program_procedure_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid; v_status text;
BEGIN
  v_pid := COALESCE(NEW.audit_program_id, OLD.audit_program_id);
  IF v_pid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(status,'Draft') INTO v_status FROM public.ia_audit_programs WHERE id = v_pid;
  IF v_status IS NOT NULL AND v_status <> 'Draft' THEN
    RAISE EXCEPTION 'IA_PROGRAMME_FROZEN: parent programme is % — procedures cannot be changed. Create a new version instead.', v_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ia_program_procedure_immutability ON public.ia_audit_procedures;
CREATE TRIGGER trg_ia_program_procedure_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_audit_procedures
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_program_procedure_immutability();

-- ============ B. ENGAGEMENT-BOUND PROGRAMME SNAPSHOT ============
CREATE TABLE IF NOT EXISTS public.ia_engagement_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.ia_audit_engagements(id) ON DELETE CASCADE,
  source_program_id uuid REFERENCES public.ia_audit_programs(id),
  source_program_version integer,
  programme_name text NOT NULL,
  objective text,
  scope text,
  methodology text,
  tailoring_notes text,
  status text NOT NULL DEFAULT 'Draft',
  approved_by text,
  approved_at timestamptz,
  superseded_at timestamptz,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT ia_engagement_programmes_status_chk CHECK (status IN ('Draft','Approved','Superseded'))
);
CREATE INDEX IF NOT EXISTS idx_ia_eng_prog_engagement ON public.ia_engagement_programmes(engagement_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ia_eng_prog_active ON public.ia_engagement_programmes(engagement_id) WHERE status = 'Approved';

CREATE TABLE IF NOT EXISTS public.ia_engagement_programme_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_programme_id uuid NOT NULL REFERENCES public.ia_engagement_programmes(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.ia_audit_engagements(id) ON DELETE CASCADE,
  step_no text,
  sort_order integer NOT NULL DEFAULT 0,
  source_procedure_id uuid,
  source_rcm_test_id uuid,
  rcm_risk_id uuid,
  rcm_control_id uuid,
  title text NOT NULL,
  description text,
  objective text,
  criteria text,
  test_type text,
  sampling_method text,
  planned_sample_size integer,
  evidence_required text,
  expected_result text,
  is_key boolean NOT NULL DEFAULT false,
  is_tailored boolean NOT NULL DEFAULT false,
  tailoring_reason text,
  execution_status text NOT NULL DEFAULT 'Not Started',
  na_rationale text,
  control_test_id uuid REFERENCES public.ia_control_tests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT ia_eng_prog_step_status_chk CHECK (execution_status IN ('Not Started','In Progress','Completed','Not Applicable'))
);
CREATE INDEX IF NOT EXISTS idx_ia_eng_prog_step_prog ON public.ia_engagement_programme_steps(engagement_programme_id);
CREATE INDEX IF NOT EXISTS idx_ia_eng_prog_step_eng ON public.ia_engagement_programme_steps(engagement_id);

ALTER TABLE public.ia_control_tests
  ADD COLUMN IF NOT EXISTS engagement_programme_step_id uuid REFERENCES public.ia_engagement_programme_steps(id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_engagement_programmes TO authenticated;
GRANT ALL ON public.ia_engagement_programmes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_engagement_programme_steps TO authenticated;
GRANT ALL ON public.ia_engagement_programme_steps TO service_role;

ALTER TABLE public.ia_engagement_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_engagement_programme_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_w1_read ON public.ia_engagement_programmes;
CREATE POLICY ia_w1_read ON public.ia_engagement_programmes FOR SELECT TO authenticated
  USING (public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_insert ON public.ia_engagement_programmes;
CREATE POLICY ia_w1_insert ON public.ia_engagement_programmes FOR INSERT TO authenticated
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_update ON public.ia_engagement_programmes;
CREATE POLICY ia_w1_update ON public.ia_engagement_programmes FOR UPDATE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id))
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_delete ON public.ia_engagement_programmes;
CREATE POLICY ia_w1_delete ON public.ia_engagement_programmes FOR DELETE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));

DROP POLICY IF EXISTS ia_w1_read ON public.ia_engagement_programme_steps;
CREATE POLICY ia_w1_read ON public.ia_engagement_programme_steps FOR SELECT TO authenticated
  USING (public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_insert ON public.ia_engagement_programme_steps;
CREATE POLICY ia_w1_insert ON public.ia_engagement_programme_steps FOR INSERT TO authenticated
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_update ON public.ia_engagement_programme_steps;
CREATE POLICY ia_w1_update ON public.ia_engagement_programme_steps FOR UPDATE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id))
  WITH CHECK (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));
DROP POLICY IF EXISTS ia_w1_delete ON public.ia_engagement_programme_steps;
CREATE POLICY ia_w1_delete ON public.ia_engagement_programme_steps FOR DELETE TO authenticated
  USING (public.ia_is_ia_user() AND public.ia_can_access_engagement_internal(engagement_id));

-- Snapshot immutability: after approval only execution fields may move
CREATE OR REPLACE FUNCTION public.ia_guard_engagement_programme_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_old jsonb; v_new jsonb; v_k text;
BEGIN
  IF TG_TABLE_NAME = 'ia_engagement_programmes' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status <> 'Draft' THEN
        RAISE EXCEPTION 'IA_PROGRAMME_SNAPSHOT_FROZEN: approved engagement programmes cannot be deleted';
      END IF;
      RETURN OLD;
    END IF;
    IF OLD.status IN ('Approved','Superseded') THEN
      v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
      FOR v_k IN SELECT jsonb_object_keys(v_old) LOOP
        IF v_k NOT IN ('status','superseded_at','updated_at','updated_by')
           AND v_old->v_k IS DISTINCT FROM v_new->v_k THEN
          RAISE EXCEPTION 'IA_PROGRAMME_SNAPSHOT_FROZEN: field "%" is frozen on an approved engagement programme', v_k;
        END IF;
      END LOOP;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.ia_engagement_programmes
   WHERE id = COALESCE(NEW.engagement_programme_id, OLD.engagement_programme_id);
  IF TG_OP = 'DELETE' THEN
    IF v_status <> 'Draft' THEN
      RAISE EXCEPTION 'IA_PROGRAMME_SNAPSHOT_FROZEN: steps of an approved engagement programme cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_status IS NOT NULL AND v_status <> 'Draft' THEN
      RAISE EXCEPTION 'IA_PROGRAMME_SNAPSHOT_FROZEN: steps cannot be added to an approved engagement programme';
    END IF;
    RETURN NEW;
  END IF;
  IF v_status IN ('Approved','Superseded') THEN
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    FOR v_k IN SELECT jsonb_object_keys(v_old) LOOP
      IF v_k NOT IN ('execution_status','na_rationale','control_test_id','updated_at','updated_by')
         AND v_old->v_k IS DISTINCT FROM v_new->v_k THEN
        RAISE EXCEPTION 'IA_PROGRAMME_SNAPSHOT_FROZEN: field "%" is frozen once the engagement programme is approved', v_k;
      END IF;
    END LOOP;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ia_eng_prog_immutability ON public.ia_engagement_programmes;
CREATE TRIGGER trg_ia_eng_prog_immutability
  BEFORE UPDATE OR DELETE ON public.ia_engagement_programmes
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_engagement_programme_immutability();

DROP TRIGGER IF EXISTS trg_ia_eng_prog_step_immutability ON public.ia_engagement_programme_steps;
CREATE TRIGGER trg_ia_eng_prog_step_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_engagement_programme_steps
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_engagement_programme_immutability();

-- ============ C. GOVERNED COMMANDS ============
CREATE OR REPLACE FUNCTION public.ia_bind_programme_to_engagement(
  p_engagement_id uuid, p_program_id uuid, p_tailoring_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    is_key, created_by, updated_by)
  SELECT v_id, p_engagement_id, pr.procedure_no, COALESCE(pr.sort_order, 0), pr.id,
         pr.rcm_test_id, pr.rcm_risk_id, pr.rcm_control_id, pr.title, pr.description, pr.objective, pr.criteria,
         pr.test_type, pr.sampling_method, pr.planned_sample_size, pr.evidence_required, pr.expected_result,
         COALESCE(pr.is_key,false), v_actor, v_actor
    FROM public.ia_audit_procedures pr
   WHERE pr.audit_program_id = p_program_id AND COALESCE(pr.is_active, true);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.ia_log_event('IA.ENGAGEMENT_PROGRAMME.BOUND', 'engagement_programme', v_id, p_engagement_id, NULL,
    NULL, jsonb_build_object('program_id', p_program_id, 'version', v_prog.version, 'steps', v_count),
    p_tailoring_notes, NULL, 'ia_bind_programme_to_engagement');

  RETURN jsonb_build_object('success', true, 'engagement_programme_id', v_id, 'steps', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.ia_approve_engagement_programme(p_engagement_programme_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      sample_size, remarks, status, is_active, created_by, updated_by)
    VALUES (v_step.rcm_control_id, v_ep.engagement_id, v_step.id,
      v_step.planned_sample_size, v_step.title, 'Planned', true, v_actor, v_actor)
    RETURNING id INTO v_ct;
    UPDATE public.ia_engagement_programme_steps SET control_test_id = v_ct, updated_by = v_actor WHERE id = v_step.id;
    v_tests := v_tests + 1;
  END LOOP;

  PERFORM public.ia_log_event('IA.ENGAGEMENT_PROGRAMME.APPROVED', 'engagement_programme', p_engagement_programme_id,
    v_ep.engagement_id, NULL, jsonb_build_object('status','Draft'),
    jsonb_build_object('status','Approved','steps',v_steps,'control_tests_created',v_tests),
    NULL, NULL, 'ia_approve_engagement_programme');

  RETURN jsonb_build_object('success', true, 'steps', v_steps, 'control_tests_created', v_tests);
END; $$;

GRANT EXECUTE ON FUNCTION public.ia_bind_programme_to_engagement(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_approve_engagement_programme(uuid) TO authenticated;