-- DEF-E2E-005: stamp finding authorship so the author/confirmer SoD control is live.
CREATE OR REPLACE FUNCTION public.ia_findings_stamp_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NULLIF(trim(NEW.created_by), ''), public.ia_actor_label());
    NEW.created_date := COALESCE(NEW.created_date, now());
  ELSE
    -- authorship is immutable once recorded
    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_ia_findings_stamp_author ON public.ia_findings;
CREATE TRIGGER zz_ia_findings_stamp_author
BEFORE INSERT OR UPDATE ON public.ia_findings
FOR EACH ROW EXECUTE FUNCTION public.ia_findings_stamp_author();

-- DEF-E2E-004: remove the superseded 9-argument overload that made the
-- communication-stage command unresolvable through the Data API (PGRST203).
DROP FUNCTION IF EXISTS public.ia_record_communication_stage(
  uuid, text, uuid, text, text, text, text, boolean, text);