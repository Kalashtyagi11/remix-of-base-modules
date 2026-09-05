
-- =====================================================================
-- IA PHASE 3C — EVIDENCE INTEGRITY & TRACEABILITY (additive only)
-- =====================================================================

ALTER TABLE public.ia_evidence
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by text,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS superseded_by_evidence_id uuid REFERENCES public.ia_evidence(id);

CREATE INDEX IF NOT EXISTS idx_ia_evidence_links_evidence ON public.ia_evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_ia_evidence_links_target ON public.ia_evidence_links(linked_type, linked_id);

-- ---------------------------------------------------------------------
-- 1. Cross-audit safety: an evidence link may never cross engagements
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_guard_evidence_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ev_eng uuid;
  v_target_eng uuid;
BEGIN
  SELECT engagement_id INTO v_ev_eng FROM public.ia_evidence WHERE id = NEW.evidence_id;
  IF v_ev_eng IS NULL THEN
    RAISE EXCEPTION 'IA_EVIDENCE_NO_ENGAGEMENT: evidence % is not bound to an engagement', NEW.evidence_id;
  END IF;
  IF NEW.engagement_id IS DISTINCT FROM v_ev_eng THEN
    RAISE EXCEPTION 'IA_EVIDENCE_CROSS_ENGAGEMENT: evidence belongs to engagement %, link requested for %', v_ev_eng, NEW.engagement_id;
  END IF;

  v_target_eng := CASE NEW.linked_type
    WHEN 'control_test'   THEN (SELECT engagement_id FROM public.ia_control_tests WHERE id = NEW.linked_id)
    WHEN 'exception'      THEN (SELECT engagement_id FROM public.ia_test_exceptions WHERE id = NEW.linked_id)
    WHEN 'finding'        THEN (SELECT engagement_id FROM public.ia_findings WHERE id = NEW.linked_id)
    WHEN 'working_paper'  THEN (SELECT engagement_id FROM public.ia_working_papers WHERE id = NEW.linked_id)
    WHEN 'programme_step' THEN (SELECT engagement_id FROM public.ia_engagement_programme_steps WHERE id = NEW.linked_id)
    WHEN 'sample_item'    THEN (SELECT t.engagement_id FROM public.ia_control_test_results r
                                  JOIN public.ia_control_tests t ON t.id = r.control_test_id
                                 WHERE r.id = NEW.linked_id)
    ELSE NULL
  END;

  IF NEW.linked_type <> 'activity' AND v_target_eng IS NULL THEN
    RAISE EXCEPTION 'IA_EVIDENCE_LINK_TARGET_MISSING: % % not found', NEW.linked_type, NEW.linked_id;
  END IF;
  IF v_target_eng IS NOT NULL AND v_target_eng <> v_ev_eng THEN
    RAISE EXCEPTION 'IA_EVIDENCE_CROSS_ENGAGEMENT: target belongs to engagement %', v_target_eng;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_guard_evidence_link ON public.ia_evidence_links;
CREATE TRIGGER trg_ia_guard_evidence_link
  BEFORE INSERT OR UPDATE ON public.ia_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_evidence_link();

-- ---------------------------------------------------------------------
-- 2. Relied-upon evidence may not be destroyed
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_evidence_is_relied_upon(p_evidence_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ia_evidence_links l
     WHERE l.evidence_id = p_evidence_id
       AND (
         (l.linked_type = 'control_test' AND EXISTS (
            SELECT 1 FROM public.ia_control_tests t WHERE t.id = l.linked_id
              AND (t.concluded_at IS NOT NULL OR t.status = 'Concluded')))
      OR (l.linked_type = 'sample_item' AND EXISTS (
            SELECT 1 FROM public.ia_control_test_results r
              JOIN public.ia_control_tests t ON t.id = r.control_test_id
             WHERE r.id = l.linked_id AND (t.concluded_at IS NOT NULL OR t.status = 'Concluded')))
      OR (l.linked_type = 'exception' AND EXISTS (
            SELECT 1 FROM public.ia_test_exceptions e WHERE e.id = l.linked_id
              AND e.evaluated_at IS NOT NULL))
      OR (l.linked_type = 'finding' AND EXISTS (
            SELECT 1 FROM public.ia_findings f WHERE f.id = l.linked_id
              AND COALESCE(f.status,'Draft') NOT IN ('Draft','Cancelled')))
      OR (l.linked_type = 'working_paper' AND EXISTS (
            SELECT 1 FROM public.ia_working_papers w WHERE w.id = l.linked_id
              AND (w.reviewed_date IS NOT NULL OR w.approved_date IS NOT NULL
                   OR COALESCE(w.status,'Draft') NOT IN ('Draft'))))
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.ia_guard_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.ia_evidence_is_relied_upon(OLD.id) THEN
      RAISE EXCEPTION 'IA_EVIDENCE_RELIED_UPON: evidence % supports completed audit work; withdraw or supersede it instead of deleting', OLD.evidence_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.hash IS NOT NULL AND NEW.hash IS DISTINCT FROM OLD.hash THEN
    RAISE EXCEPTION 'IA_EVIDENCE_HASH_IMMUTABLE: integrity value of evidence % cannot be changed', OLD.evidence_id;
  END IF;
  IF OLD.storage_path IS NOT NULL AND NEW.storage_path IS DISTINCT FROM OLD.storage_path
     AND public.ia_evidence_is_relied_upon(OLD.id) THEN
    RAISE EXCEPTION 'IA_EVIDENCE_FILE_IMMUTABLE: stored file of evidence % is relied upon; add a replacement evidence record instead', OLD.evidence_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_guard_evidence_mutation ON public.ia_evidence;
CREATE TRIGGER trg_ia_guard_evidence_mutation
  BEFORE UPDATE OR DELETE ON public.ia_evidence
  FOR EACH ROW EXECUTE FUNCTION public.ia_guard_evidence_mutation();

-- ---------------------------------------------------------------------
-- 3. Governed link / unlink / inheritance commands
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_link_evidence(
  p_evidence_id uuid,
  p_linked_type text,
  p_linked_id uuid,
  p_link_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eng uuid;
  v_id uuid;
BEGIN
  SELECT engagement_id INTO v_eng FROM public.ia_evidence WHERE id = p_evidence_id;
  IF v_eng IS NULL THEN
    RAISE EXCEPTION 'IA_EVIDENCE_NOT_FOUND: %', p_evidence_id;
  END IF;
  IF NOT public.ia_can_access_engagement_internal(v_eng) THEN
    RAISE EXCEPTION 'IA_EVIDENCE_FORBIDDEN: no access to engagement %', v_eng;
  END IF;

  INSERT INTO public.ia_evidence_links(evidence_id, engagement_id, linked_type, linked_id, link_role, created_by)
  VALUES (p_evidence_id, v_eng, p_linked_type, p_linked_id, p_link_role, auth.uid()::text)
  ON CONFLICT (evidence_id, linked_type, linked_id) DO UPDATE SET link_role = COALESCE(EXCLUDED.link_role, ia_evidence_links.link_role)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ia_unlink_evidence(p_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.ia_evidence_links;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO v_link FROM public.ia_evidence_links WHERE id = p_link_id;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'IA_EVIDENCE_LINK_NOT_FOUND: %', p_link_id;
  END IF;
  IF NOT public.ia_can_access_engagement_internal(v_link.engagement_id) THEN
    RAISE EXCEPTION 'IA_EVIDENCE_FORBIDDEN: no access to engagement %', v_link.engagement_id;
  END IF;

  v_blocked := CASE v_link.linked_type
    WHEN 'control_test' THEN EXISTS (SELECT 1 FROM public.ia_control_tests t WHERE t.id = v_link.linked_id AND (t.concluded_at IS NOT NULL OR t.status = 'Concluded'))
    WHEN 'sample_item' THEN EXISTS (SELECT 1 FROM public.ia_control_test_results r JOIN public.ia_control_tests t ON t.id = r.control_test_id WHERE r.id = v_link.linked_id AND (t.concluded_at IS NOT NULL OR t.status = 'Concluded'))
    WHEN 'exception' THEN EXISTS (SELECT 1 FROM public.ia_test_exceptions e WHERE e.id = v_link.linked_id AND e.evaluated_at IS NOT NULL)
    WHEN 'finding' THEN EXISTS (SELECT 1 FROM public.ia_findings f WHERE f.id = v_link.linked_id AND COALESCE(f.status,'Draft') NOT IN ('Draft','Cancelled'))
    WHEN 'working_paper' THEN EXISTS (SELECT 1 FROM public.ia_working_papers w WHERE w.id = v_link.linked_id AND (w.reviewed_date IS NOT NULL OR w.approved_date IS NOT NULL))
    ELSE false
  END;

  IF v_blocked THEN
    RAISE EXCEPTION 'IA_EVIDENCE_LINK_LOCKED: % is completed/reviewed work; the evidence reference cannot be removed', v_link.linked_type;
  END IF;

  DELETE FROM public.ia_evidence_links WHERE id = p_link_id;
  RETURN true;
END;
$$;

-- Carry supporting evidence forward from a sample item / exception to a finding
CREATE OR REPLACE FUNCTION public.ia_inherit_exception_evidence(
  p_exception_id uuid,
  p_finding_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exc public.ia_test_exceptions;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_exc FROM public.ia_test_exceptions WHERE id = p_exception_id;
  IF v_exc.id IS NULL THEN
    RAISE EXCEPTION 'IA_EXCEPTION_NOT_FOUND: %', p_exception_id;
  END IF;
  IF NOT public.ia_can_access_engagement_internal(v_exc.engagement_id) THEN
    RAISE EXCEPTION 'IA_EVIDENCE_FORBIDDEN: no access to engagement %', v_exc.engagement_id;
  END IF;

  WITH src AS (
    SELECT DISTINCT l.evidence_id
      FROM public.ia_evidence_links l
     WHERE (l.linked_type = 'exception' AND l.linked_id = p_exception_id)
        OR (l.linked_type = 'sample_item' AND l.linked_id = v_exc.sample_result_id)
        OR (l.linked_type = 'control_test' AND l.linked_id = v_exc.control_test_id)
  ), ins AS (
    INSERT INTO public.ia_evidence_links(evidence_id, engagement_id, linked_type, linked_id, link_role, created_by)
    SELECT s.evidence_id, v_exc.engagement_id, 'finding', p_finding_id, 'Inherited from exception', auth.uid()::text
      FROM src s
    ON CONFLICT (evidence_id, linked_type, linked_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ia_link_evidence(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_unlink_evidence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_inherit_exception_evidence(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_evidence_is_relied_upon(uuid) TO authenticated;
