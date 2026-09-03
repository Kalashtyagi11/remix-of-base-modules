-- DEF-E3B-003: the Head of Internal Audit identity had no active staff
-- assignment, so Omni-Comms runtime authorisation refused the organisation.
WITH prof AS (
  INSERT INTO public.core_staff_profiles (user_id, employee_code, display_name, work_email, employment_status, is_active)
  SELECT '22222222-aaaa-4aaa-8aaa-000000000002', 'IA-HIA-001', 'Head of Internal Audit', 'audit.hia@mishainfotech.com', 'ACTIVE', true
  WHERE NOT EXISTS (SELECT 1 FROM public.core_staff_profiles WHERE user_id = '22222222-aaaa-4aaa-8aaa-000000000002')
  RETURNING id
), resolved AS (
  SELECT id FROM prof
  UNION ALL
  SELECT id FROM public.core_staff_profiles WHERE user_id = '22222222-aaaa-4aaa-8aaa-000000000002'
  LIMIT 1
)
INSERT INTO public.core_staff_assignments (staff_profile_id, user_id, department_id, assignment_type, assignment_status, is_primary, is_active)
SELECT (SELECT id FROM resolved), '22222222-aaaa-4aaa-8aaa-000000000002', '8ebc900a-3f89-41cc-8094-cfe572339200', 'PRIMARY', 'ACTIVE', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.core_staff_assignments
  WHERE user_id = '22222222-aaaa-4aaa-8aaa-000000000002'
    AND department_id = '8ebc900a-3f89-41cc-8094-cfe572339200'
);