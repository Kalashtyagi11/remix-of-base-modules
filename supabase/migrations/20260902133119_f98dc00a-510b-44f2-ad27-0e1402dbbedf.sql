DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc
   WHERE proname = 'ce_legal_candidate_register_v1'
     AND pronamespace = 'public'::regnamespace
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'ce_legal_candidate_register_v1 not found; nothing to patch';
    RETURN;
  END IF;

  IF position('ce_legal_candidate_evaluate(v.*)' in v_def) = 0 THEN
    RAISE NOTICE 'already patched';
    RETURN;
  END IF;

  v_def := replace(v_def, 'ce_legal_candidate_evaluate(v.*)', 'ce_legal_candidate_evaluate(v)');
  EXECUTE v_def;
END
$mig$;