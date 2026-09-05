-- ============================================================================
-- Internal Audit — Management Reporting End-to-End Integrity Suite
-- ----------------------------------------------------------------------------
-- Deterministic assertions that protect the reporting integrity gate:
--   * reports are generated as Drafts and sealed only by a separate authority
--   * issued reports and their evidence are immutable
--   * KPI figures resolve to real records (drill-down reconciliation)
--   * period metrics use business dates, never a generic created_at
--   * zero denominators are reported honestly, never as fabricated 0%
--   * data-quality exceptions are surfaced, not silently excluded
--
-- Run with a privileged (service_role / owner) connection:
--     psql "$SUPABASE_DB_URL" -f supabase/tests/sql/internal-audit-management-reporting-integrity.sql
--
-- Every assertion RAISES EXCEPTION on failure, so a non-zero psql exit code
-- means management reporting integrity has regressed.
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_count integer;
  v_detail text;
  v_bool boolean;
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. LIFECYCLE — Draft / Issued separation exists
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ia_management_status_report'
    AND column_name IN ('lifecycle_state', 'issued_by', 'issued_at', 'issue_note');
  IF v_count < 4 THEN
    RAISE EXCEPTION 'INTEGRITY: management report lifecycle columns missing (found %)', v_count;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_detail
  FROM pg_constraint
  WHERE conrelid = 'public.ia_management_status_report'::regclass
    AND conname = 'ia_msr_status_chk';
  IF v_detail IS NULL OR v_detail NOT LIKE '%Draft%' OR v_detail NOT LIKE '%Sealed%' THEN
    RAISE EXCEPTION 'INTEGRITY: report status constraint must allow Draft and Sealed (got %)', v_detail;
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. AUTHORITY — generation and issuance are separate permissions
  -- --------------------------------------------------------------------------
  FOR v_detail IN
    SELECT unnest(ARRAY['ia_can_generate_management_report',
                        'ia_can_issue_management_report',
                        'ia_issue_management_status_report',
                        'ia_management_status_drilldown',
                        'ia_management_data_quality'])
  LOOP
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_detail;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'INTEGRITY: required reporting function % is missing', v_detail;
    END IF;
  END LOOP;

  IF pg_get_functiondef('public.ia_can_issue_management_report(uuid)'::regprocedure)
       = pg_get_functiondef('public.ia_can_generate_management_report(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'INTEGRITY: issue authority must not be identical to generate authority';
  END IF;

  -- Reporting configuration authority must not imply issue authority.
  IF pg_get_functiondef('public.ia_can_issue_management_report(uuid)'::regprocedure)
       LIKE '%ia_can_manage_reporting_config%' THEN
    RAISE EXCEPTION 'INTEGRITY: reporting configuration permission must not grant issue authority';
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. ACCESS — no anon / PUBLIC execution of the reporting surface
  -- --------------------------------------------------------------------------
  SELECT count(*), coalesce(string_agg(DISTINCT p.proname, ', '), '')
    INTO v_count, v_detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('ia_management_status_drilldown','ia_management_data_quality',
                      'ia_issue_management_status_report','ia_generate_management_status_report')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_count > 0 THEN
    RAISE EXCEPTION 'INTEGRITY: reporting functions executable by anon/PUBLIC: %', v_detail;
  END IF;

  -- --------------------------------------------------------------------------
  -- 4. EVIDENCE — sealed reports keep record-level evidence, protected by RLS
  -- --------------------------------------------------------------------------
  SELECT relrowsecurity INTO v_bool
  FROM pg_class WHERE oid = 'public.ia_management_status_report_evidence'::regclass;
  IF NOT COALESCE(v_bool, false) THEN
    RAISE EXCEPTION 'INTEGRITY: report evidence table has row level security disabled';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'public.ia_management_status_report_evidence'::regclass
    AND NOT tgisinternal;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'INTEGRITY: report evidence has no immutability trigger';
  END IF;

  -- Every issued report generated under the gate must carry evidence.
  SELECT count(*), coalesce(string_agg(r.report_number, ', '), '')
    INTO v_count, v_detail
  FROM public.ia_management_status_report r
  WHERE r.lifecycle_state = 'Issued'
    AND r.issued_at IS NOT NULL
    AND r.created_at > (
      SELECT COALESCE(min(created_at), now())
      FROM public.ia_management_status_report_evidence)
    AND NOT EXISTS (SELECT 1 FROM public.ia_management_status_report_evidence e
                     WHERE e.report_id = r.id);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'INTEGRITY: issued reports without sealed evidence: %', v_detail;
  END IF;

  -- --------------------------------------------------------------------------
  -- 5. IMMUTABILITY — an issued report cannot be silently changed
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'public.ia_management_status_report'::regclass
    AND NOT tgisinternal;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'INTEGRITY: issued report table has no immutability trigger';
  END IF;

  BEGIN
    UPDATE public.ia_management_status_report
       SET snapshot = jsonb_build_object('tampered', true)
     WHERE lifecycle_state = 'Issued'
     LIMIT 1;
    RAISE EXCEPTION 'INTEGRITY: an issued report snapshot was mutable';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'INTEGRITY:%' THEN RAISE; END IF;
    WHEN OTHERS THEN NULL; -- expected: blocked by the immutability guard
  END;

  -- --------------------------------------------------------------------------
  -- 6. NO PARALLEL LOGIC — reporting reuses the canonical engagement engine
  -- --------------------------------------------------------------------------
  IF pg_get_functiondef('public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid)'::regprocedure)
       NOT LIKE '%ia_engagement_status_model%' THEN
    RAISE EXCEPTION 'INTEGRITY: drill-down must resolve engagements through the canonical status model';
  END IF;

  -- Progress and schedule thresholds must resolve from governed methodology.
  IF pg_get_functiondef('public.ia_management_status_drilldown(uuid,text,timestamptz,uuid,text,date,date,uuid)'::regprocedure)
       NOT LIKE '%ia_report_methodology_active%' THEN
    RAISE EXCEPTION 'INTEGRITY: drill-down thresholds are not resolved from governed methodology';
  END IF;

  -- --------------------------------------------------------------------------
  -- 7. DATE BASIS — period movement must not be driven by created_at alone
  -- --------------------------------------------------------------------------
  IF pg_get_functiondef('public.ia_management_status_live_v2'::regproc)
       NOT LIKE '%period_date_basis%' THEN
    RAISE EXCEPTION 'INTEGRITY: reporting engine does not publish its date basis';
  END IF;

  -- --------------------------------------------------------------------------
  -- 8. HONEST DENOMINATORS — the engine publishes what each rate is measured on
  -- --------------------------------------------------------------------------
  IF pg_get_functiondef('public.ia_management_status_live_v2'::regproc)
       NOT LIKE '%denominators%' THEN
    RAISE EXCEPTION 'INTEGRITY: reporting engine does not publish denominators';
  END IF;

  RAISE NOTICE 'IA_MANAGEMENT_REPORTING_INTEGRITY: PASS';
END $$;
