-- ============================================================================
-- INTERNAL AUDIT — Reporting configuration convergence (no-hardcoding gate)
-- ============================================================================

-- 0. Organisation / country resolution -------------------------------------
CREATE OR REPLACE FUNCTION public.ia_org_country_code()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT o.country_code FROM public.core_organization o
      WHERE COALESCE(o.status,'Active') ILIKE 'Active%' AND o.country_code IS NOT NULL
      ORDER BY o.created_at LIMIT 1),
    (SELECT s.country_code FROM public.core_number_sequence s
      WHERE s.module_code = 'INTERNAL_AUDIT' AND s.is_active ORDER BY s.created_at LIMIT 1),
    'SKN');
$$;
REVOKE ALL ON FUNCTION public.ia_org_country_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_org_country_code() TO authenticated, service_role;

-- Numbering guard resolves the country from the organisation master.
CREATE OR REPLACE FUNCTION public.ia_artifact_reference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity  TEXT := TG_ARGV[0];
  v_col     TEXT := TG_ARGV[1];
  v_admin   BOOLEAN := coalesce(current_setting('ia.allow_code_override', TRUE), 'off') = 'on';
  v_country TEXT := public.ia_org_country_code();
  v_new     TEXT;
  v_old     TEXT;
  v_row     RECORD;
BEGIN
  v_new := to_jsonb(NEW) ->> v_col;

  IF TG_OP = 'INSERT' THEN
    IF v_admin AND v_new IS NOT NULL AND btrim(v_new) <> '' THEN
      RETURN NEW;
    END IF;
    SELECT * INTO v_row FROM public.core_generate_number(
      'INTERNAL_AUDIT', v_entity, v_country, NULL, NULL, NULL);
    IF v_row.generated_number IS NULL THEN
      RAISE EXCEPTION 'IA_NUMBERING_UNAVAILABLE: no active INTERNAL_AUDIT/% sequence for %', v_entity, v_country;
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

-- 1. Who may maintain reporting configuration ------------------------------
CREATE OR REPLACE FUNCTION public.ia_can_manage_reporting_config()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'Admin'::app_role)
    OR public.ia_actor_can('Internal Audit', 'configure')
    OR public.ia_actor_can('Internal Audit', 'approve')
  );
$$;
REVOKE ALL ON FUNCTION public.ia_can_manage_reporting_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_can_manage_reporting_config() TO authenticated, service_role;

-- 2. Configuration change log ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_report_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_key text,
  action text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  actor text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ia_report_config_audit TO authenticated;
GRANT ALL ON public.ia_report_config_audit TO service_role;
ALTER TABLE public.ia_report_config_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_report_config_audit_read ON public.ia_report_config_audit;
CREATE POLICY ia_report_config_audit_read ON public.ia_report_config_audit
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

-- 3. Versioned methodologies ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_report_methodology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_code text NOT NULL,
  version_number integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  config jsonb NOT NULL,
  notes text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_report_methodology_uk UNIQUE (methodology_code, version_number),
  CONSTRAINT ia_report_methodology_status_chk CHECK (status = ANY (ARRAY['Draft','Active','Superseded','Retired'])),
  CONSTRAINT ia_report_methodology_code_chk CHECK (methodology_code = ANY (ARRAY['PROGRESS','SCHEDULE','PLAN_HEALTH']))
);
GRANT SELECT ON public.ia_report_methodology TO authenticated;
GRANT ALL ON public.ia_report_methodology TO service_role;
ALTER TABLE public.ia_report_methodology ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_report_methodology_read ON public.ia_report_methodology;
CREATE POLICY ia_report_methodology_read ON public.ia_report_methodology
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

CREATE UNIQUE INDEX IF NOT EXISTS ia_report_methodology_active_uk
  ON public.ia_report_methodology (methodology_code) WHERE status = 'Active';

-- Direct writes are refused: governed RPCs only.
CREATE OR REPLACE FUNCTION public.zz_ia_report_config_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('ia.report_config_write', TRUE), 'off') <> 'on' THEN
    RAISE EXCEPTION 'IA_REPORT_CONFIG_GOVERNED: use the governed reporting configuration commands';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.zz_ia_report_config_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_ia_report_methodology_guard ON public.ia_report_methodology;
CREATE TRIGGER zz_ia_report_methodology_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_report_methodology
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_report_config_guard();

-- 4. Report catalogue -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_report_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code text NOT NULL UNIQUE,
  report_name text NOT NULL,
  audience_code text NOT NULL,
  permitted_scope text NOT NULL DEFAULT 'PLAN',
  template_type text,
  document_classification text NOT NULL DEFAULT 'Internal',
  requires_approval boolean NOT NULL DEFAULT false,
  distribution_policy text NOT NULL DEFAULT 'GOVERNED_ATTACHMENT',
  comparison_behaviour text NOT NULL DEFAULT 'PREVIOUS_SEALED',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics text[] NOT NULL DEFAULT '{}',
  version_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_report_definition_scope_chk CHECK (permitted_scope = ANY (ARRAY['PLAN','DEPARTMENT','PLAN_OR_DEPARTMENT']))
);
GRANT SELECT ON public.ia_report_definition TO authenticated;
GRANT ALL ON public.ia_report_definition TO service_role;
ALTER TABLE public.ia_report_definition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_report_definition_read ON public.ia_report_definition;
CREATE POLICY ia_report_definition_read ON public.ia_report_definition
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());
DROP TRIGGER IF EXISTS zz_ia_report_definition_guard ON public.ia_report_definition;
CREATE TRIGGER zz_ia_report_definition_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_report_definition
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_report_config_guard();

CREATE TABLE IF NOT EXISTS public.ia_report_definition_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.ia_report_definition(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  heading text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_visible boolean NOT NULL DEFAULT true,
  start_on_new_page boolean NOT NULL DEFAULT false,
  display_mode text NOT NULL DEFAULT 'detail',
  is_appendix boolean NOT NULL DEFAULT false,
  audiences text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_report_definition_section_uk UNIQUE (definition_id, section_key),
  CONSTRAINT ia_report_section_mode_chk CHECK (display_mode = ANY (ARRAY['summary','detail','appendix']))
);
GRANT SELECT ON public.ia_report_definition_section TO authenticated;
GRANT ALL ON public.ia_report_definition_section TO service_role;
ALTER TABLE public.ia_report_definition_section ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_report_definition_section_read ON public.ia_report_definition_section;
CREATE POLICY ia_report_definition_section_read ON public.ia_report_definition_section
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());
DROP TRIGGER IF EXISTS zz_ia_report_definition_section_guard ON public.ia_report_definition_section;
CREATE TRIGGER zz_ia_report_definition_section_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_report_definition_section
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_report_config_guard();

-- 5. Metric registry --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_report_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_code text NOT NULL UNIQUE,
  label text NOT NULL,
  formatter text NOT NULL DEFAULT 'integer',
  source_path text NOT NULL,
  dimensions text[] NOT NULL DEFAULT '{}',
  audiences text[] NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_report_metric_fmt_chk CHECK (formatter = ANY (ARRAY['integer','percent','decimal','hours','date','text'])),
  -- source_path is a controlled dotted payload path, never SQL.
  CONSTRAINT ia_report_metric_path_chk CHECK (source_path ~ '^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$')
);
GRANT SELECT ON public.ia_report_metric TO authenticated;
GRANT ALL ON public.ia_report_metric TO service_role;
ALTER TABLE public.ia_report_metric ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_report_metric_read ON public.ia_report_metric;
CREATE POLICY ia_report_metric_read ON public.ia_report_metric
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());
DROP TRIGGER IF EXISTS zz_ia_report_metric_guard ON public.ia_report_metric;
CREATE TRIGGER zz_ia_report_metric_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ia_report_metric
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_report_config_guard();

-- 6. Seed defaults (current behaviour preserved) ----------------------------
DO $seed$
DECLARE v_def uuid;
BEGIN
  PERFORM set_config('ia.report_config_write', 'on', true);

  -- Reference master: audiences and reporting periods
  INSERT INTO public.ia_reference_type (code, name, description, is_active, display_order)
  VALUES ('MANAGEMENT_REPORT_AUDIENCE','Management Report Audience','Audiences permitted for Internal Audit management status reporting', true, 70),
         ('MANAGEMENT_REPORT_PERIOD','Management Report Period','Reporting period presets resolved against the governed fiscal calendar', true, 71)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.ia_reference_value (reference_type, code, name, description, is_active, display_order, is_system)
  VALUES
    ('MANAGEMENT_REPORT_AUDIENCE','HIA','HIA','Head of Internal Audit', true, 10, true),
    ('MANAGEMENT_REPORT_AUDIENCE','Executive Management','Executive Management', null, true, 20, true),
    ('MANAGEMENT_REPORT_AUDIENCE','Audit / Risk Committee','Audit / Risk Committee', null, true, 30, true),
    ('MANAGEMENT_REPORT_AUDIENCE','Department Management','Department Management','Requires a department scope', true, 40, true),
    ('MANAGEMENT_REPORT_PERIOD','CURRENT','Current status (plan to date)', null, true, 10, true),
    ('MANAGEMENT_REPORT_PERIOD','Q1','Q1','Derived from the governed fiscal calendar', true, 20, true),
    ('MANAGEMENT_REPORT_PERIOD','Q2','Q2','Derived from the governed fiscal calendar', true, 30, true),
    ('MANAGEMENT_REPORT_PERIOD','Q3','Q3','Derived from the governed fiscal calendar', true, 40, true),
    ('MANAGEMENT_REPORT_PERIOD','Q4','Q4','Derived from the governed fiscal calendar', true, 50, true),
    ('MANAGEMENT_REPORT_PERIOD','MONTH','Month to date', null, true, 60, true),
    ('MANAGEMENT_REPORT_PERIOD','YTD','Year to date','Fiscal year to date', true, 70, true),
    ('MANAGEMENT_REPORT_PERIOD','CUSTOM','Custom period', null, true, 80, true)
  ON CONFLICT DO NOTHING;

  -- Methodologies (v1 = the values previously fixed in code)
  INSERT INTO public.ia_report_methodology (methodology_code, version_number, name, status, config, notes, created_by, approved_by, approved_at)
  SELECT 'PROGRESS', 1, 'Engagement progress methodology v1', 'Active', jsonb_build_object(
    'default_weight', 5,
    'terminal_weight_floor', 95,
    'max_execution_contribution', 10,
    'stages', jsonb_build_array(
      jsonb_build_object('code','CANCELLED','field','status','match','Cancelled%','weight',0),
      jsonb_build_object('code','CLOSED_ACTIONS_PENDING','field','status','match','%Actions Pending%','weight',95),
      jsonb_build_object('code','CLOSED','field','status','match','Closed%','weight',100),
      jsonb_build_object('code','CARRIED_FORWARD','field','status','match','Carried Forward%','weight',60),
      jsonb_build_object('code','REPORT_ISSUED','field','status','match','%Report Issued%','weight',85),
      jsonb_build_object('code','DRAFT_REPORT','field','status','match','%Draft Report%','weight',65),
      jsonb_build_object('code','REPORTING','field','status','match','%Reporting%','weight',65),
      jsonb_build_object('code','FIELDWORK','field','status','match','%Fieldwork%','weight',45),
      jsonb_build_object('code','IN_PROGRESS','field','status','match','%In Progress%','weight',45),
      jsonb_build_object('code','EXECUTION','field','status','match','%Execution%','weight',45),
      jsonb_build_object('code','PREPARED','field','preparation_status','match','%Complete%','weight',20),
      jsonb_build_object('code','SCHEDULED','field','scheduled','match','','weight',10)),
    'execution_components', jsonb_build_array(
      jsonb_build_object('code','CONTROL_TESTS','label','Control tests','max_points',5),
      jsonb_build_object('code','WORKING_PAPERS','label','Working papers','max_points',3),
      jsonb_build_object('code','FINDING_RESPONSES','label','Responded findings','max_points',2)),
    'milestones', jsonb_build_array(
      jsonb_build_object('min',85,'label','Engagement closure'),
      jsonb_build_object('min',65,'label','Issue final report'),
      jsonb_build_object('min',45,'label','Complete fieldwork and draft report'),
      jsonb_build_object('min',20,'label','Launch fieldwork'),
      jsonb_build_object('min',10,'label','Complete preparation')),
    'default_milestone', 'Schedule the engagement',
    'in_progress_min_pct', 20)
  , 'Seeded from the values previously fixed in application code.', 'CONFIG_CONVERGENCE', 'CONFIG_CONVERGENCE', now()
  WHERE NOT EXISTS (SELECT 1 FROM public.ia_report_methodology WHERE methodology_code = 'PROGRESS');

  INSERT INTO public.ia_report_methodology (methodology_code, version_number, name, status, config, notes, created_by, approved_by, approved_at)
  SELECT 'SCHEDULE', 1, 'Schedule health methodology v1', 'Active', jsonb_build_object(
    'at_risk_window_days', 14,
    'at_risk_progress_ceiling', 65,
    'not_started_after_planned_start_is_at_risk', true,
    'delay_forecast_days', 14,
    'on_track_labels', jsonb_build_array('On Track','Completed On Time'))
  , 'Seeded from the values previously fixed in application code.', 'CONFIG_CONVERGENCE', 'CONFIG_CONVERGENCE', now()
  WHERE NOT EXISTS (SELECT 1 FROM public.ia_report_methodology WHERE methodology_code = 'SCHEDULE');

  INSERT INTO public.ia_report_methodology (methodology_code, version_number, name, status, config, notes, created_by, approved_by, approved_at)
  SELECT 'PLAN_HEALTH', 1, 'Plan health methodology v1', 'Active', jsonb_build_object(
    'rules', jsonb_build_array(
      jsonb_build_object('code','SCHED_LT_90','metric','schedule_adherence_pct','operator','<','threshold',90,'score',1,'severity','Medium','label','Schedule adherence below 90%'),
      jsonb_build_object('code','SCHED_LT_70','metric','schedule_adherence_pct','operator','<','threshold',70,'score',1,'severity','High','label','Schedule adherence below 70%'),
      jsonb_build_object('code','CH_GT_0','metric','open_critical_high','operator','>','threshold',0,'score',1,'severity','High','label','Open Critical/High findings'),
      jsonb_build_object('code','CH_GT_5','metric','open_critical_high','operator','>','threshold',5,'score',1,'severity','Critical','label','More than five open Critical/High findings'),
      jsonb_build_object('code','OVERDUE_GT_0','metric','overdue_actions','operator','>','threshold',0,'score',1,'severity','High','label','Overdue corrective actions'),
      jsonb_build_object('code','OVERDUE_GT_10','metric','overdue_actions','operator','>','threshold',10,'score',1,'severity','Critical','label','More than ten overdue corrective actions'),
      jsonb_build_object('code','CAPACITY_OVER','metric','capacity_over_allocated','operator','=','threshold',1,'score',1,'severity','Medium','label','Allocated effort exceeds available capacity')),
    'bands', jsonb_build_object('red_min_score',4,'amber_min_score',2),
    'attention_severity', jsonb_build_object(
      'overdue_action','Critical','delayed_engagement','High','critical_high_finding','Critical','capacity','Medium'))
  , 'Seeded from the values previously fixed in application code.', 'CONFIG_CONVERGENCE', 'CONFIG_CONVERGENCE', now()
  WHERE NOT EXISTS (SELECT 1 FROM public.ia_report_methodology WHERE methodology_code = 'PLAN_HEALTH');

  -- Metric registry
  INSERT INTO public.ia_report_metric (metric_code, label, formatter, source_path, dimensions, audiences, display_order, is_enabled)
  VALUES
    ('PLAN_COMPLETION_PCT','Plan completion','percent','kpis.plan_completion_pct','{plan,department}','{}',10,true),
    ('SCHEDULE_ADHERENCE_PCT','Schedule adherence','percent','kpis.schedule_adherence_pct','{plan,department}','{}',20,true),
    ('APPROVED_ENGAGEMENTS','Approved engagements','integer','kpis.approved_engagements','{plan,department}','{}',30,true),
    ('AUDITS_COMPLETED_PERIOD','Audits completed in period','integer','period_movement.audits_completed','{plan,department,period}','{}',40,true),
    ('AUDITS_STARTED_PERIOD','Audits started in period','integer','period_movement.audits_started','{plan,department,period}','{}',50,true),
    ('OPEN_SIGNIFICANT_FINDINGS','Open Critical/High findings','integer','findings.open_critical_high','{plan,department}','{}',60,true),
    ('OVERDUE_ACTIONS','Overdue corrective actions','integer','actions.overdue','{plan,department}','{}',70,true),
    ('OPEN_ACTIONS','Open corrective actions','integer','actions.open','{plan,department}','{}',80,true),
    ('FOLLOWUPS_DUE','Follow-ups due','integer','prior_history.follow_ups_due','{plan,department}','{}',90,true),
    ('CAPACITY_UTILISATION','Allocated hours','hours','capacity.allocated_hours','{plan,department}','{}',100,true)
  ON CONFLICT (metric_code) DO NOTHING;

  -- Section library entries reused by the management report
  INSERT INTO public.ia_document_section_library
    (section_key, label, applies_to, is_shared, default_enabled, default_order, display_mode, is_mandatory, category, description)
  VALUES
    ('MSR_COVER','Cover & reporting context',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,10,'detail',true,'Management Status','Report identity, period and cumulative as-at date'),
    ('MSR_HEALTH','Plan health',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,20,'summary',false,'Management Status','Configured plan health rating and basis'),
    ('MSR_KPI','Key performance indicators',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,30,'summary',false,'Management Status','Registered report metrics'),
    ('MSR_PERIOD_MOVEMENT','Reporting period activity',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,40,'detail',false,'Management Status','Movement inside the selected period'),
    ('MSR_COMPLETED_AUDITS','Audits completed — conclusions & material issues',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,50,'detail',false,'Management Status','Issued report conclusions for completed audits'),
    ('MSR_ENGAGEMENTS','Engagement status',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,60,'detail',false,'Management Status','Per-engagement progress and schedule health'),
    ('MSR_FINDINGS','Findings & corrective actions',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,70,'detail',false,'Management Status','Findings profile and action ageing'),
    ('MSR_THEMES','Recurring themes & assurance coverage',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,80,'detail',false,'Management Status','Cross-audit themes and coverage'),
    ('MSR_OUTLOOK','Outlook & forecast',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,90,'detail',false,'Management Status','Deterministic projection to fiscal year end'),
    ('MSR_PRIOR_CAPACITY','Prior issues & capacity',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,100,'detail',false,'Management Status','Prior-cycle exposure and resourcing'),
    ('MSR_ATTENTION','Management attention',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,110,'detail',false,'Management Status','Items requiring a management decision'),
    ('MSR_PROVENANCE','Basis of preparation',ARRAY['MANAGEMENT_STATUS_REPORT'],false,true,120,'appendix',true,'Management Status','Configuration versions used to calculate the report')
  ON CONFLICT DO NOTHING;

  -- Report catalogue
  INSERT INTO public.ia_report_definition
    (report_code, report_name, audience_code, permitted_scope, template_type, document_classification,
     requires_approval, distribution_policy, comparison_behaviour, metrics, display_order)
  VALUES
    ('MSR_EXEC_SNAPSHOT','Executive Snapshot','Executive Management','PLAN','MANAGEMENT_STATUS_REPORT','Internal',false,'GOVERNED_ATTACHMENT','PREVIOUS_SEALED',
      '{PLAN_COMPLETION_PCT,SCHEDULE_ADHERENCE_PCT,OPEN_SIGNIFICANT_FINDINGS,OVERDUE_ACTIONS}',10),
    ('MSR_DETAILED','Detailed Management Report','HIA','PLAN_OR_DEPARTMENT','MANAGEMENT_STATUS_REPORT','Internal',false,'GOVERNED_ATTACHMENT','PREVIOUS_SEALED',
      '{PLAN_COMPLETION_PCT,SCHEDULE_ADHERENCE_PCT,APPROVED_ENGAGEMENTS,AUDITS_COMPLETED_PERIOD,AUDITS_STARTED_PERIOD,OPEN_SIGNIFICANT_FINDINGS,OPEN_ACTIONS,OVERDUE_ACTIONS,FOLLOWUPS_DUE,CAPACITY_UTILISATION}',20),
    ('MSR_COMMITTEE','Audit / Risk Committee Report','Audit / Risk Committee','PLAN','MANAGEMENT_STATUS_REPORT','Confidential',true,'GOVERNED_ATTACHMENT','PREVIOUS_SEALED',
      '{PLAN_COMPLETION_PCT,SCHEDULE_ADHERENCE_PCT,AUDITS_COMPLETED_PERIOD,OPEN_SIGNIFICANT_FINDINGS,OVERDUE_ACTIONS}',30),
    ('MSR_DEPARTMENT','Department Management Report','Department Management','DEPARTMENT','MANAGEMENT_STATUS_REPORT','Internal',false,'GOVERNED_ATTACHMENT','PREVIOUS_SEALED',
      '{PLAN_COMPLETION_PCT,SCHEDULE_ADHERENCE_PCT,OPEN_SIGNIFICANT_FINDINGS,OPEN_ACTIONS,OVERDUE_ACTIONS}',40)
  ON CONFLICT (report_code) DO NOTHING;

  FOR v_def IN SELECT id FROM public.ia_report_definition LOOP
    INSERT INTO public.ia_report_definition_section
      (definition_id, section_key, heading, sort_order, is_visible, start_on_new_page, display_mode, is_appendix)
    SELECT v_def, l.section_key, l.label, l.default_order,
           CASE
             WHEN (SELECT report_code FROM public.ia_report_definition WHERE id = v_def) = 'MSR_EXEC_SNAPSHOT'
               AND l.section_key IN ('MSR_ENGAGEMENTS','MSR_PRIOR_CAPACITY','MSR_THEMES') THEN false
             ELSE true END,
           l.section_key IN ('MSR_COMPLETED_AUDITS','MSR_ENGAGEMENTS'),
           l.display_mode, l.display_mode = 'appendix'
    FROM public.ia_document_section_library l
    WHERE 'MANAGEMENT_STATUS_REPORT' = ANY (l.applies_to)
    ON CONFLICT (definition_id, section_key) DO NOTHING;
  END LOOP;

  PERFORM set_config('ia.report_config_write', 'off', true);
END;
$seed$;

-- 7. Resolver ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_report_methodology_active(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'methodology_code', m.methodology_code,
           'version', m.version_number,
           'name', m.name,
           'effective_from', m.effective_from,
           'config', m.config)
  FROM public.ia_report_methodology m
  WHERE m.methodology_code = p_code AND m.status = 'Active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ia_report_methodology_active(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_methodology_active(text) TO authenticated, service_role;

-- 8. Governed configuration commands ---------------------------------------
CREATE OR REPLACE FUNCTION public.ia_report_validate_methodology(p_code text, p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_allowed text[] := ARRAY['schedule_adherence_pct','open_critical_high','overdue_actions','plan_completion_pct','capacity_over_allocated'];
  r jsonb;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_config');
  END IF;

  IF p_code = 'PROGRESS' THEN
    IF jsonb_typeof(p_config -> 'stages') <> 'array' OR jsonb_array_length(p_config -> 'stages') = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'stages_required');
    END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p_config -> 'stages') LOOP
      IF (r ->> 'weight') IS NULL OR (r ->> 'weight')::numeric < 0 OR (r ->> 'weight')::numeric > 100 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stage_weight_out_of_range');
      END IF;
      IF COALESCE(r ->> 'field','status') NOT IN ('status','preparation_status','scheduled') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stage_field_not_permitted');
      END IF;
    END LOOP;
    IF COALESCE((p_config ->> 'max_execution_contribution')::numeric, -1) < 0
       OR COALESCE((p_config ->> 'max_execution_contribution')::numeric, 101) > 100 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'execution_contribution_out_of_range');
    END IF;
  ELSIF p_code = 'SCHEDULE' THEN
    IF COALESCE((p_config ->> 'at_risk_window_days')::numeric, -1) < 0
       OR COALESCE((p_config ->> 'at_risk_window_days')::numeric, 999) > 365 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'at_risk_window_out_of_range');
    END IF;
    IF COALESCE((p_config ->> 'at_risk_progress_ceiling')::numeric, -1) < 0
       OR COALESCE((p_config ->> 'at_risk_progress_ceiling')::numeric, 101) > 100 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'progress_ceiling_out_of_range');
    END IF;
  ELSIF p_code = 'PLAN_HEALTH' THEN
    IF jsonb_typeof(p_config -> 'rules') <> 'array' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'rules_required');
    END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p_config -> 'rules') LOOP
      IF NOT ((r ->> 'metric') = ANY (v_allowed)) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'metric_not_permitted', 'detail', r ->> 'metric');
      END IF;
      IF (r ->> 'operator') NOT IN ('<','<=','>','>=','=') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'operator_not_permitted');
      END IF;
      IF (r ->> 'threshold') IS NULL OR (r ->> 'score') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'threshold_and_score_required');
      END IF;
    END LOOP;
    IF (p_config -> 'bands' ->> 'red_min_score') IS NULL OR (p_config -> 'bands' ->> 'amber_min_score') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'bands_required');
    END IF;
    IF (p_config -> 'bands' ->> 'red_min_score')::numeric <= (p_config -> 'bands' ->> 'amber_min_score')::numeric THEN
      RETURN jsonb_build_object('ok', false, 'code', 'band_boundaries_invalid');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'unknown_methodology');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_report_validate_methodology(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_validate_methodology(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_report_save_methodology_draft(
  p_code text, p_config jsonb, p_name text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chk jsonb; v_ver integer; v_id uuid; v_actor text := public.ia_actor_label();
BEGIN
  IF NOT public.ia_can_manage_reporting_config() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  v_chk := public.ia_report_validate_methodology(p_code, p_config);
  IF NOT (v_chk ->> 'ok')::boolean THEN RETURN v_chk; END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_ver
    FROM public.ia_report_methodology WHERE methodology_code = p_code;

  PERFORM set_config('ia.report_config_write', 'on', true);
  INSERT INTO public.ia_report_methodology (methodology_code, version_number, name, status, config, notes, created_by)
  VALUES (p_code, v_ver, COALESCE(p_name, p_code || ' methodology v' || v_ver), 'Draft', p_config, p_notes, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.ia_report_config_audit (entity_type, entity_key, action, after_value, actor, reason)
  VALUES ('METHODOLOGY', p_code || ' v' || v_ver, 'DRAFT_CREATED', p_config, v_actor, p_notes);
  PERFORM set_config('ia.report_config_write', 'off', true);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_report_save_methodology_draft(text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_save_methodology_draft(text, jsonb, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_report_activate_methodology(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ia_report_methodology%ROWTYPE; v_chk jsonb; v_actor text := public.ia_actor_label(); v_prev jsonb;
BEGIN
  IF NOT public.ia_can_manage_reporting_config() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  SELECT * INTO v_row FROM public.ia_report_methodology WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;
  IF v_row.status <> 'Draft' THEN RETURN jsonb_build_object('ok', false, 'code', 'only_draft_can_be_activated'); END IF;

  v_chk := public.ia_report_validate_methodology(v_row.methodology_code, v_row.config);
  IF NOT (v_chk ->> 'ok')::boolean THEN RETURN v_chk; END IF;

  SELECT jsonb_build_object('version', version_number, 'config', config) INTO v_prev
    FROM public.ia_report_methodology
   WHERE methodology_code = v_row.methodology_code AND status = 'Active';

  PERFORM set_config('ia.report_config_write', 'on', true);
  UPDATE public.ia_report_methodology
     SET status = 'Superseded', updated_at = now()
   WHERE methodology_code = v_row.methodology_code AND status = 'Active';
  UPDATE public.ia_report_methodology
     SET status = 'Active', approved_by = v_actor, approved_at = now(), updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.ia_report_config_audit (entity_type, entity_key, action, before_value, after_value, actor, reason)
  VALUES ('METHODOLOGY', v_row.methodology_code || ' v' || v_row.version_number, 'ACTIVATED',
          v_prev, jsonb_build_object('version', v_row.version_number, 'config', v_row.config), v_actor, p_reason);
  PERFORM set_config('ia.report_config_write', 'off', true);

  RETURN jsonb_build_object('ok', true, 'version', v_row.version_number);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_report_activate_methodology(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_activate_methodology(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_report_configure_section(
  p_section_id uuid, p_is_visible boolean DEFAULT NULL, p_sort_order integer DEFAULT NULL,
  p_heading text DEFAULT NULL, p_start_on_new_page boolean DEFAULT NULL, p_display_mode text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_actor text := public.ia_actor_label();
BEGIN
  IF NOT public.ia_can_manage_reporting_config() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  IF p_display_mode IS NOT NULL AND p_display_mode NOT IN ('summary','detail','appendix') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_display_mode');
  END IF;
  SELECT to_jsonb(s) INTO v_before FROM public.ia_report_definition_section s WHERE s.id = p_section_id;
  IF v_before IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;

  PERFORM set_config('ia.report_config_write', 'on', true);
  UPDATE public.ia_report_definition_section
     SET is_visible = COALESCE(p_is_visible, is_visible),
         sort_order = COALESCE(p_sort_order, sort_order),
         heading = COALESCE(NULLIF(btrim(p_heading), ''), heading),
         start_on_new_page = COALESCE(p_start_on_new_page, start_on_new_page),
         display_mode = COALESCE(p_display_mode, display_mode),
         is_appendix = COALESCE(p_display_mode, display_mode) = 'appendix',
         updated_at = now()
   WHERE id = p_section_id
  RETURNING to_jsonb(ia_report_definition_section) INTO v_after;

  INSERT INTO public.ia_report_config_audit (entity_type, entity_key, action, before_value, after_value, actor)
  VALUES ('REPORT_SECTION', v_before ->> 'section_key', 'UPDATED', v_before, v_after, v_actor);
  PERFORM set_config('ia.report_config_write', 'off', true);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_report_configure_section(uuid, boolean, integer, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_configure_section(uuid, boolean, integer, text, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ia_report_configure_metric(
  p_metric_code text, p_is_enabled boolean DEFAULT NULL, p_display_order integer DEFAULT NULL, p_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_actor text := public.ia_actor_label();
BEGIN
  IF NOT public.ia_can_manage_reporting_config() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  SELECT to_jsonb(m) INTO v_before FROM public.ia_report_metric m WHERE m.metric_code = p_metric_code;
  IF v_before IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;

  PERFORM set_config('ia.report_config_write', 'on', true);
  UPDATE public.ia_report_metric
     SET is_enabled = COALESCE(p_is_enabled, is_enabled),
         display_order = COALESCE(p_display_order, display_order),
         label = COALESCE(NULLIF(btrim(p_label), ''), label),
         updated_at = now()
   WHERE metric_code = p_metric_code
  RETURNING to_jsonb(ia_report_metric) INTO v_after;

  INSERT INTO public.ia_report_config_audit (entity_type, entity_key, action, before_value, after_value, actor)
  VALUES ('REPORT_METRIC', p_metric_code, 'UPDATED', v_before, v_after, v_actor);
  PERFORM set_config('ia.report_config_write', 'off', true);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_report_configure_metric(text, boolean, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_report_configure_metric(text, boolean, integer, text) TO authenticated, service_role;

-- 9. Snapshot provenance column --------------------------------------------
ALTER TABLE public.ia_management_status_report
  ADD COLUMN IF NOT EXISTS config_provenance jsonb;