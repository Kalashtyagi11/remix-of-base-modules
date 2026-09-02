DO $mig$
DECLARE
  v_def text;
  v_old text := '        ''rule_name'', p.rule_name,
';
  v_new text := '        ''rule_name'', p.rule_name
      ) || jsonb_build_object(
';
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc
   WHERE proname = 'ce_legal_candidate_register_v1'
     AND pronamespace = 'public'::regnamespace
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ce_legal_candidate_register_v1 not found';
  END IF;

  IF position('|| jsonb_build_object(' in v_def) > 0 THEN
    RAISE NOTICE 'already split';
    RETURN;
  END IF;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'split anchor not found';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$mig$;