-- Stage 2B: reject conflicting display text instead of silently normalising it.
CREATE OR REPLACE FUNCTION public.ia_engagement_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_id UUID; v_name TEXT; v_text_changed BOOLEAN;
BEGIN
  -- ---------------- Audit / Engagement Type ----------------
  IF TG_OP = 'INSERT'
     OR NEW.engagement_type_id IS DISTINCT FROM OLD.engagement_type_id
     OR NEW.engagement_type IS DISTINCT FROM OLD.engagement_type THEN

    v_text_changed := (TG_OP = 'INSERT') OR (NEW.engagement_type IS DISTINCT FROM OLD.engagement_type);

    IF NEW.engagement_type_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('AUDIT_TYPE', NEW.engagement_type_id);
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.engagement_type_id;
      IF v_text_changed
         AND NEW.engagement_type IS NOT NULL
         AND btrim(NEW.engagement_type) <> ''
         AND btrim(NEW.engagement_type) <> v_name THEN
        RAISE EXCEPTION 'IA_REFERENCE_TEXT_CONFLICT: "%" does not match the selected AUDIT_TYPE "%"',
          NEW.engagement_type, v_name;
      END IF;
      NEW.engagement_type := v_name;  -- text demoted to display snapshot
    ELSIF NEW.engagement_type IS NOT NULL AND btrim(NEW.engagement_type) <> '' THEN
      v_id := public.ia_reference_resolve('AUDIT_TYPE', NEW.engagement_type);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active AUDIT_TYPE', NEW.engagement_type;
      END IF;
      NEW.engagement_type_id := v_id;
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = v_id;
      NEW.engagement_type := v_name;
    END IF;
  END IF;

  -- ---------------- Coverage Category ----------------
  IF TG_OP = 'INSERT'
     OR NEW.coverage_category_id IS DISTINCT FROM OLD.coverage_category_id
     OR NEW.coverage_category IS DISTINCT FROM OLD.coverage_category THEN

    v_text_changed := (TG_OP = 'INSERT') OR (NEW.coverage_category IS DISTINCT FROM OLD.coverage_category);

    IF NEW.coverage_category_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('COVERAGE_CATEGORY', NEW.coverage_category_id);
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.coverage_category_id;
      IF v_text_changed
         AND NEW.coverage_category IS NOT NULL
         AND btrim(NEW.coverage_category) <> '' THEN
        IF public.ia_is_risk_band_label(NEW.coverage_category) THEN
          RAISE EXCEPTION 'IA_INVALID_REFERENCE_SEMANTICS: "%" is a risk classification, not a coverage category',
            NEW.coverage_category;
        END IF;
        IF btrim(NEW.coverage_category) <> v_name THEN
          RAISE EXCEPTION 'IA_REFERENCE_TEXT_CONFLICT: "%" does not match the selected COVERAGE_CATEGORY "%"',
            NEW.coverage_category, v_name;
        END IF;
      END IF;
      NEW.coverage_category := v_name;
    ELSIF NEW.coverage_category IS NOT NULL AND btrim(NEW.coverage_category) <> '' THEN
      IF public.ia_is_risk_band_label(NEW.coverage_category) THEN
        RAISE EXCEPTION 'IA_INVALID_REFERENCE_SEMANTICS: "%" is a risk classification, not a coverage category',
          NEW.coverage_category;
      END IF;
      v_id := public.ia_reference_resolve('COVERAGE_CATEGORY', NEW.coverage_category);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active COVERAGE_CATEGORY', NEW.coverage_category;
      END IF;
      NEW.coverage_category_id := v_id;
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = v_id;
      NEW.coverage_category := v_name;
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.ia_follow_up_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_id UUID; v_name TEXT; v_text_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.follow_up_type_id IS DISTINCT FROM OLD.follow_up_type_id
     OR NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type THEN

    v_text_changed := (TG_OP = 'INSERT') OR (NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type);

    IF NEW.follow_up_type_id IS NOT NULL THEN
      PERFORM public.ia_reference_assert_id('FOLLOW_UP_TYPE', NEW.follow_up_type_id);
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = NEW.follow_up_type_id;
      IF v_text_changed
         AND NEW.follow_up_type IS NOT NULL
         AND btrim(NEW.follow_up_type) <> ''
         AND btrim(NEW.follow_up_type) <> v_name THEN
        RAISE EXCEPTION 'IA_REFERENCE_TEXT_CONFLICT: "%" does not match the selected FOLLOW_UP_TYPE "%"',
          NEW.follow_up_type, v_name;
      END IF;
      NEW.follow_up_type := v_name;
    ELSIF NEW.follow_up_type IS NOT NULL AND btrim(NEW.follow_up_type) <> '' THEN
      v_id := public.ia_reference_resolve('FOLLOW_UP_TYPE', NEW.follow_up_type);
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'IA_UNKNOWN_REFERENCE: "%" is not an active FOLLOW_UP_TYPE', NEW.follow_up_type;
      END IF;
      NEW.follow_up_type_id := v_id;
      SELECT name INTO v_name FROM public.ia_reference_value WHERE id = v_id;
      NEW.follow_up_type := v_name;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;