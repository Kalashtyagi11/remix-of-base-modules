REVOKE EXECUTE ON FUNCTION public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_management_data_quality(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_can_generate_management_report(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_can_issue_management_report(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_issue_management_status_report(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_msr_capture_evidence(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.zz_ia_msr_evidence_immutable() FROM PUBLIC, anon;