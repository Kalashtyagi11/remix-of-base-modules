UPDATE public.app_modules
   SET is_enabled = true,
       show_in_menu = false,
       updated_at = now()
 WHERE name IN ('quality_review','findings_recommendations','working_papers',
                'evidence_management','control_testing','activity_workbench','management_responses');