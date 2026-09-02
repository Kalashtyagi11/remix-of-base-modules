-- 1) Provision controlled department-head identities via the central identity path
DO $seed$
DECLARE
  u RECORD;
  v_hash text;
  v_pwd text;
  v_src_dept uuid;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('22222222-aaaa-4aaa-8aaa-000000000010'::uuid,'audit.mgmt.records@mishainfotech.com','Registration & Records Management Respondent','Registration & Records','Management Respondent','IA_MANAGEMENT_RESPONDENT','IA-ACC-MGMT-RECORDS','Registration & Records'),
      ('22222222-aaaa-4aaa-8aaa-000000000011'::uuid,'audit.mgmt.hr@mishainfotech.com','Human Resources Management Respondent','Human Resources','Management Respondent','IA_MANAGEMENT_RESPONDENT','IA-ACC-MGMT-HR','Human Resources'),
      ('22222222-aaaa-4aaa-8aaa-000000000012'::uuid,'audit.mgmt.director@mishainfotech.com','Office of the Director Management Respondent','Office of the Director','Management Respondent','IA_MANAGEMENT_RESPONDENT','IA-ACC-MGMT-DIRECTOR','Office of the Director')
    ) AS t(uid,email,full_name,first_name,last_name,role_name,user_code,dept_name)
  LOOP
    -- Random credential: never seeded from repository source
    v_pwd := encode(gen_random_bytes(24), 'base64');
    v_hash := crypt(v_pwd, gen_salt('bf'));

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      u.uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      u.email, v_hash, now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', u.full_name, 'acceptance_fixture', true, 'fixture_tag', u.user_code),
      now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
      updated_at = now();

    INSERT INTO auth.identities (
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), u.uid, 'email', u.uid::text,
      jsonb_build_object('sub', u.uid::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    )
    ON CONFLICT (provider, provider_id) DO UPDATE SET
      identity_data = EXCLUDED.identity_data, updated_at = now();

    v_src_dept := NULL;
    SELECT d.source_department_id INTO v_src_dept
    FROM public.ia_departments d
    WHERE d.name = u.dept_name AND d.is_active AND d.source_department_id IS NOT NULL
    LIMIT 1;

    INSERT INTO public.profiles (
      id, email, full_name, first_name, last_name,
      department_id, user_code, is_active, force_password_change
    ) VALUES (
      u.uid, u.email, u.full_name, u.first_name, u.last_name,
      v_src_dept, u.user_code, true, false
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      department_id = EXCLUDED.department_id,
      user_code = EXCLUDED.user_code,
      is_active = true;

    DELETE FROM public.user_roles ur WHERE ur.user_id = u.uid AND ur.role::text <> u.role_name;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.uid AND ur.role::text = u.role_name) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (u.uid, u.role_name);
    END IF;
  END LOOP;
END $seed$;

-- 2) Link the previously unlinked live departments to a real head identity
UPDATE public.ia_departments
   SET head_profile_id = '22222222-aaaa-4aaa-8aaa-000000000010',
       head = 'Registration & Records Management Respondent',
       updated_at = now()
 WHERE id = '2e5e7b22-9f56-4810-8abc-33278c263977';

UPDATE public.ia_departments
   SET head_profile_id = '22222222-aaaa-4aaa-8aaa-000000000011',
       head = 'Human Resources Management Respondent',
       updated_at = now()
 WHERE id = 'fa78d911-4298-41d9-9ffe-5e15f583e927';

UPDATE public.ia_departments
   SET head_profile_id = '22222222-aaaa-4aaa-8aaa-000000000012',
       head = 'Office of the Director Management Respondent',
       updated_at = now()
 WHERE id = 'f531eb96-7519-4bb6-ba20-4a98edc7033f';

UPDATE public.ia_departments
   SET head_profile_id = '22222222-aaaa-4aaa-8aaa-000000000002',
       head = 'Head of Internal Audit',
       updated_at = now()
 WHERE id = '4c5ad05b-9b98-45ae-a147-0a98956d9b49';

-- 3) Canonical recipient order for audit communications:
--    approved office-holder designation first, then the department's recorded head.
CREATE OR REPLACE FUNCTION public.ia_comms_escalation_fact(p_role text, p_department_id uuid, p_engagement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_res jsonb;
BEGIN
  IF p_role = 'department_head' THEN
    v_res := public.ia_resolve_escalation_recipient('department_head', p_department_id, p_engagement_id);
    IF coalesce(v_res->>'outcome','') = 'RESOLVED' THEN
      v := public.ia_comms_profile_fact('department_head', (v_res->>'profile_id')::uuid, v_res->>'display_name');
    ELSE
      v := '{}'::jsonb;
    END IF;
  ELSIF p_role = 'lead_auditor' THEN
    SELECT COALESCE(public.ia_comms_profile_fact('lead_auditor', au.profile_id, au.name), '{}'::jsonb)
      INTO v
    FROM public.ia_audit_engagements e
    JOIN public.ia_auditors au ON au.id = e.lead_auditor_id
    WHERE e.id = p_engagement_id;
  ELSIF p_role = 'head_of_audit' THEN
    v := COALESCE(public.ia_comms_profile_fact('head_of_audit', public.ia_comms_resolve_head_of_audit(), 'Head of Internal Audit'), '{}'::jsonb);
  END IF;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$function$;