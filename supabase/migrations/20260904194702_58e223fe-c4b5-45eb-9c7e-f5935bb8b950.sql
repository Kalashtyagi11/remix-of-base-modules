GRANT EXECUTE ON FUNCTION public.ia_management_status_live_v2(uuid,timestamptz,text,uuid,text,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_management_data_quality(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_can_generate_management_report(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_can_issue_management_report(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_issue_management_status_report(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_msr_capture_evidence(uuid) TO service_role;