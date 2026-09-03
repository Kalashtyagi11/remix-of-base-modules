-- DEF-E3B-002: Internal Audit operator roles could not raise operator-initiated
-- communications: omni-comms-runtime authorisation requires omni_comms.operate
-- plus the caller-module permission (internal_audit.view) and neither was
-- granted to the IA operator roles.
INSERT INTO public.role_permissions (role_id, module_id, action_id, is_granted)
SELECT r.id, m.id, ma.id, true
FROM public.roles r
CROSS JOIN public.app_modules m
JOIN public.module_actions ma ON ma.module_id = m.id
WHERE r.role_name IN ('IA_HEAD_OF_INTERNAL_AUDIT','IA_AUDIT_ADMIN','IA_LEAD_AUDITOR','IA_TEAM_MEMBER')
  AND (
    (m.name = 'internal_audit' AND ma.action_name = 'view')
    OR (m.name = 'omni_comms' AND ma.action_name = 'operate'
        AND r.role_name IN ('IA_HEAD_OF_INTERNAL_AUDIT','IA_AUDIT_ADMIN','IA_LEAD_AUDITOR'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.module_id = m.id AND rp.action_id = ma.id
  );