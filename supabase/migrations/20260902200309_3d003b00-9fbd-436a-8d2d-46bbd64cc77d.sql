-- Wave-1 hardening granted only read access to ia_plan_distribution_logs, so
-- recording a distribution failed with "permission denied for table".
-- Distribution records are append-only evidence: insert + read only, never
-- update or delete.
GRANT INSERT ON public.ia_plan_distribution_logs TO authenticated;
GRANT ALL ON public.ia_plan_distribution_logs TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'ia_plan_distribution_logs' AND p.polname = 'ia_w1_insert'
  ) THEN
    CREATE POLICY ia_w1_insert ON public.ia_plan_distribution_logs
      FOR INSERT TO authenticated
      WITH CHECK (public.ia_is_ia_user());
  END IF;
END $$;