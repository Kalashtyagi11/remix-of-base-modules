DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE proname = 'ce_legal_candidate_register_v1'
     AND pronamespace = 'public'::regnamespace;

  IF d IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;

  n := replace(d,
    E'''rule_name'', p.rule_name,\n        ''outstanding_amount''',
    E'''rule_name'', p.rule_name)\n      || jsonb_build_object(\n        ''outstanding_amount''');

  IF n = d THEN RAISE EXCEPTION 'split anchor not found'; END IF;

  EXECUTE n;
END $do$;