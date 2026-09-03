-- Stage 2F: authoritative IA artefact reference convergence onto the central numbering engine.

INSERT INTO public.core_number_sequence
  (module_code, entity_type, country_code, prefix_pattern, number_pattern, separator,
   padding_length, current_number, reset_frequency, is_active, description, created_by)
SELECT v.module_code, v.entity_type, 'SKN', v.prefix_pattern, v.number_pattern, '-',
       6, 0, 'YEARLY', TRUE, v.description, 'STAGE_2F'
FROM (VALUES
  ('INTERNAL_AUDIT','FINDING','IA-FND-SKN','IA-FND-SKN-{YYYY}-{SEQ}','Internal Audit finding authoritative reference'),
  ('INTERNAL_AUDIT','WORKING_PAPER','IA-WP-SKN','IA-WP-SKN-{YYYY}-{SEQ}','Internal Audit working paper authoritative reference'),
  ('INTERNAL_AUDIT','EVIDENCE','IA-EVD-SKN','IA-EVD-SKN-{YYYY}-{SEQ}','Internal Audit evidence authoritative reference (single canonical entity)'),
  ('INTERNAL_AUDIT','REPORT','IA-RPT-SKN','IA-RPT-SKN-{YYYY}-{SEQ}','Internal Audit report authoritative number'),
  ('INTERNAL_AUDIT','LEAVE_REQUEST','IA-LR-SKN','IA-LR-SKN-{YYYY}-{SEQ}','Internal Audit leave request authoritative reference')
) AS v(module_code, entity_type, prefix_pattern, number_pattern, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.core_number_sequence s
  WHERE s.module_code = v.module_code AND s.entity_type = v.entity_type AND s.country_code = 'SKN'
);

-- One shared allocator/immutability guard for every converged IA artefact reference.
CREATE OR REPLACE FUNCTION public.ia_artifact_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity TEXT := TG_ARGV[0];
  v_col    TEXT := TG_ARGV[1];
  v_admin  BOOLEAN := coalesce(current_setting('ia.allow_code_override', TRUE), 'off') = 'on';
  v_new    TEXT;
  v_old    TEXT;
  v_row    RECORD;
BEGIN
  v_new := to_jsonb(NEW) ->> v_col;

  IF TG_OP = 'INSERT' THEN
    -- Governed migration/backfill path only (server-side GUC). The browser never chooses.
    IF v_admin AND v_new IS NOT NULL AND btrim(v_new) <> '' THEN
      RETURN NEW;
    END IF;
    SELECT * INTO v_row FROM public.core_generate_number(
      'INTERNAL_AUDIT', v_entity, 'SKN', NULL, NULL, NULL);
    IF v_row.generated_number IS NULL THEN
      RAISE EXCEPTION 'IA_NUMBERING_UNAVAILABLE: no active INTERNAL_AUDIT/% sequence', v_entity;
    END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_col, v_row.generated_number));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) ->> v_col;
    IF v_new IS DISTINCT FROM v_old AND NOT v_admin THEN
      RAISE EXCEPTION 'IA_REFERENCE_IMMUTABLE: % reference cannot be changed after allocation', v_entity;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ia_artifact_reference_guard() FROM PUBLIC, anon, authenticated;

-- Cut over: retire the table-local allocators (functions retained for rollback understanding).
DROP TRIGGER IF EXISTS zz_ia_assign_finding_reference ON public.ia_findings;
DROP TRIGGER IF EXISTS zz_ia_assign_working_paper_reference ON public.ia_working_papers;

DROP TRIGGER IF EXISTS zz_ia_finding_reference_guard ON public.ia_findings;
CREATE TRIGGER zz_ia_finding_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_findings
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard('FINDING', 'finding_id');

DROP TRIGGER IF EXISTS zz_ia_working_paper_reference_guard ON public.ia_working_papers;
CREATE TRIGGER zz_ia_working_paper_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_working_papers
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard('WORKING_PAPER', 'working_paper_id');

DROP TRIGGER IF EXISTS zz_ia_evidence_reference_guard ON public.ia_evidence;
CREATE TRIGGER zz_ia_evidence_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_evidence
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard('EVIDENCE', 'evidence_id');

DROP TRIGGER IF EXISTS zz_ia_report_number_guard ON public.ia_audit_reports;
CREATE TRIGGER zz_ia_report_number_guard
  BEFORE INSERT OR UPDATE ON public.ia_audit_reports
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard('REPORT', 'report_number');

DROP TRIGGER IF EXISTS zz_ia_leave_request_reference_guard ON public.ia_leave_requests;
CREATE TRIGGER zz_ia_leave_request_reference_guard
  BEFORE INSERT OR UPDATE ON public.ia_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.ia_artifact_reference_guard('LEAVE_REQUEST', 'request_id');

-- Duplicate protection for newly issued canonical references only; history untouched.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_findings_canonical_reference
  ON public.ia_findings (finding_id) WHERE finding_id LIKE 'IA-FND-SKN-%';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_working_papers_canonical_reference
  ON public.ia_working_papers (working_paper_id) WHERE working_paper_id LIKE 'IA-WP-SKN-%';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_evidence_canonical_reference
  ON public.ia_evidence (evidence_id) WHERE evidence_id LIKE 'IA-EVD-SKN-%';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_audit_reports_canonical_number
  ON public.ia_audit_reports (report_number) WHERE report_number LIKE 'IA-RPT-SKN-%';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_leave_requests_canonical_reference
  ON public.ia_leave_requests (request_id) WHERE request_id LIKE 'IA-LR-SKN-%';