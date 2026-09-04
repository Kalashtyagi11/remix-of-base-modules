INSERT INTO public.ia_checklist_template_items (template_id, category, question, description, evidence_required, sort_order, is_active)
SELECT t.id, v.category, v.question, v.description, v.evidence_required, v.sort_order, true
FROM public.ia_checklist_templates t
JOIN (VALUES
  ('Governance','Is the process governed by an approved and current policy?','Confirm the policy is approved by the relevant authority and within its review date.',true,0),
  ('Governance','Are roles, responsibilities and delegated authorities documented?','Obtain the delegation of authority matrix or equivalent.',true,1),
  ('Process','Are standard operating procedures documented and available to staff?','Confirm SOPs match current practice.',true,2),
  ('Controls','Is segregation of duties enforced between preparation, review and approval?','Test a sample of transactions for independent review.',true,3),
  ('Controls','Are system access rights restricted and periodically reviewed?','Obtain the latest user access review.',true,4),
  ('Controls','Are exceptions, overrides and manual adjustments logged and approved?','Review the exception log for the audit period.',true,5),
  ('Records','Are records complete, accurate and retained per the retention schedule?','Sample-test record completeness.',true,6),
  ('Reconciliation','Are periodic reconciliations performed, reviewed and signed off?','Obtain reconciliations for the audit period.',true,7),
  ('Monitoring','Are key performance and control indicators monitored and reported?','Obtain management reporting for the period.',false,8),
  ('Prior Audit','Have prior audit findings and agreed actions been implemented?','Verify implementation evidence for prior actions.',true,9)
) AS v(category,question,description,evidence_required,sort_order) ON true
WHERE t.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.ia_checklist_template_items i WHERE i.template_id = t.id);