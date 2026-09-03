DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'ia_reference_admin_can',
        'ia_reference_assert_id',
        'ia_reference_configuration_health',
        'ia_reference_resolve',
        'ia_reference_value_no_delete'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.ia_reference_configuration_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_reference_admin_can() TO authenticated;