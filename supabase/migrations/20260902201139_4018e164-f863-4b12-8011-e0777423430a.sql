
-- Stage 2C / DEF-E2E-009: authoritative engagement numbering via the central platform engine.

-- 1. Register the IA engagement sequence in the canonical numbering configuration.
INSERT INTO public.core_number_sequence
  (module_code, entity_type, country_code, prefix_pattern, number_pattern,
   separator, padding_length, current_number, reset_frequency, is_active, description)
SELECT 'INTERNAL_AUDIT', 'ENGAGEMENT', 'SKN', 'IA-ENG-SKN', 'IA-ENG-SKN-{YYYY}-{SEQ}',
       '-', 6, 0, 'YEARLY', TRUE, 'Internal Audit engagement authoritative reference'
WHERE NOT EXISTS (
  SELECT 1 FROM public.core_number_sequence
  WHERE module_code = 'INTERNAL_AUDIT' AND entity_type = 'ENGAGEMENT' AND country_code = 'SKN'
);

-- 2. Server-side allocation + immutability guard.
CREATE OR REPLACE FUNCTION public.ia_engagement_code_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   RECORD;
  v_admin BOOLEAN := coalesce(current_setting('ia.allow_code_override', TRUE), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The browser never chooses the authoritative code. Any supplied value is discarded.
    IF v_admin AND NEW.engagement_code IS NOT NULL AND btrim(NEW.engagement_code) <> '' THEN
      RETURN NEW;   -- governed migration / backfill path only (server-side GUC)
    END IF;
    SELECT * INTO v_row FROM public.core_generate_number(
      'INTERNAL_AUDIT', 'ENGAGEMENT', 'SKN', NULL, NULL, NULL);
    IF v_row.generated_number IS NULL THEN
      RAISE EXCEPTION 'IA_NUMBERING_UNAVAILABLE: no active INTERNAL_AUDIT/ENGAGEMENT sequence';
    END IF;
    NEW.engagement_code := v_row.generated_number;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.engagement_code IS DISTINCT FROM OLD.engagement_code AND NOT v_admin THEN
      RAISE EXCEPTION 'IA_ENGAGEMENT_CODE_IMMUTABLE: engagement code cannot be changed after allocation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_ia_engagement_code_guard ON public.ia_audit_engagements;
CREATE TRIGGER zz_ia_engagement_code_guard
BEFORE INSERT OR UPDATE ON public.ia_audit_engagements
FOR EACH ROW EXECUTE FUNCTION public.ia_engagement_code_guard();

-- 3. Database integrity. Historical values preserved; one legacy duplicate kept as a
--    documented exception and surfaced through Configuration Health.
ALTER TABLE public.ia_audit_engagements ALTER COLUMN engagement_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ia_audit_engagements_code_uq
  ON public.ia_audit_engagements (engagement_code)
  WHERE engagement_code <> 'ENG-2026-2027-001';
