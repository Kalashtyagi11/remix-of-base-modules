-- DEF-50E2E-001: management/auditee respondents could directly UPDATE or DELETE
-- internal audit work products (e.g. change a finding severity) because the
-- write policies used ia_can_access_engagement(), which includes department
-- respondents. Authoritative changes must run through governed commands
-- (SECURITY DEFINER) which bypass RLS, so direct writes are restricted to the
-- internal audit side only. Read policies are unchanged.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ia_findings', 'ia_action_tracking', 'ia_activities', 'ia_follow_ups',
    'ia_audit_reports', 'ia_audit_closure', 'ia_plan_version_engagements',
    'ia_management_responses'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ia_w1_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ia_w1_delete ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ia_w1_insert ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY ia_w1_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.ia_can_access_engagement_internal(engagement_id))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY ia_w1_update ON public.%I
        FOR UPDATE TO authenticated
        USING (public.ia_can_access_engagement_internal(engagement_id))
        WITH CHECK (public.ia_can_access_engagement_internal(engagement_id))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY ia_w1_delete ON public.%I
        FOR DELETE TO authenticated
        USING (public.ia_can_access_engagement_internal(engagement_id))
    $f$, t);
  END LOOP;
END $$;