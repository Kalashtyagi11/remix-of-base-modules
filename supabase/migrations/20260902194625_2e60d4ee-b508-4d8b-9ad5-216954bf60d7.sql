-- Stage 2B security closure: reference master privilege lockdown (additive, idempotent)
REVOKE ALL ON TABLE public.ia_reference_type FROM anon, authenticated;
REVOKE ALL ON TABLE public.ia_reference_value FROM anon, authenticated;
REVOKE ALL ON TABLE public.ia_reference_migration_map FROM anon, authenticated;

GRANT SELECT ON public.ia_reference_type TO authenticated;
GRANT SELECT ON public.ia_reference_value TO authenticated;
GRANT SELECT ON public.ia_reference_migration_map TO authenticated;

GRANT ALL ON public.ia_reference_type TO service_role;
GRANT ALL ON public.ia_reference_value TO service_role;
GRANT ALL ON public.ia_reference_migration_map TO service_role;

-- Governed helpers must not be reachable by anonymous callers.
REVOKE EXECUTE ON FUNCTION public.ia_reference_admin_can() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ia_reference_configuration_health() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ia_reference_value_no_delete() FROM anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('ia_reference_assert_id','ia_reference_resolve')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- RLS on the migration map so authenticated reads remain policy-governed.
ALTER TABLE public.ia_reference_migration_map ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ia_reference_migration_map'
      AND policyname = 'ia_reference_migration_map_read'
  ) THEN
    CREATE POLICY ia_reference_migration_map_read
      ON public.ia_reference_migration_map
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;