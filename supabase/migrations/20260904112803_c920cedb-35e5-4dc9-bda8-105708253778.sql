CREATE OR REPLACE FUNCTION public.ia_progress_corrective_action(
  p_action_id uuid,
  p_status text,
  p_notes text DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_responsible_person text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_a record;
  v_actor text := public.ia_actor_label();
  v_notes text := COALESCE(trim(p_notes), '');
  v_internal boolean;
  v_mgmt boolean;
  v_closing boolean;
BEGIN
  SELECT * INTO v_a FROM public.ia_action_tracking WHERE id = p_action_id;
  IF v_a IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_NOT_FOUND', 'error', 'Corrective action not found');
  END IF;

  IF p_status NOT IN ('Open','Assigned','In Progress','Verification Required','Returned','Reopened','Verified','Closed','Cancelled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_INVALID_STATUS', 'error', 'Unknown corrective action status');
  END IF;

  v_internal := public.ia_can_access_engagement_internal(v_a.engagement_id);
  v_mgmt := public.ia_actor_can('action_tracking', 'edit');
  v_closing := p_status IN ('Verified','Closed','Cancelled');

  IF NOT (v_internal OR v_mgmt) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN',
      'error', 'You do not have permission to update this corrective action');
  END IF;

  IF v_closing AND NOT (v_internal AND (public.ia_actor_can('action_tracking','close') OR public.ia_can_read_all())) THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_FORBIDDEN_CLOSURE',
      'error', 'Only the audit team may verify, close or cancel a corrective action');
  END IF;

  IF v_closing AND v_notes = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_REASON_REQUIRED',
      'error', 'Closure or cancellation evidence notes are required');
  END IF;

  IF COALESCE(v_a.status,'') IN ('Closed','Cancelled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'IA_ACTION_TERMINAL',
      'error', 'This corrective action is already in a terminal state');
  END IF;

  UPDATE public.ia_action_tracking
     SET status = p_status,
         action_status = p_status,
         lifecycle_status = p_status,
         responsible_person = COALESCE(NULLIF(trim(COALESCE(p_responsible_person,'')), ''), responsible_person),
         target_date = COALESCE(p_target_date, target_date),
         current_target_date = COALESCE(p_target_date, current_target_date, target_date),
         notes = CASE WHEN v_notes = '' THEN notes ELSE v_notes END,
         latest_update = CASE WHEN v_notes = '' THEN latest_update ELSE v_notes END,
         latest_update_at = now(),
         latest_update_by = v_actor,
         management_completion_date = CASE WHEN p_status = 'Verification Required' THEN now() ELSE management_completion_date END,
         verification_status = CASE WHEN p_status = 'Verification Required' THEN 'Pending'
                                    WHEN p_status = 'Verified' THEN 'Verified'
                                    ELSE verification_status END,
         verified_by = CASE WHEN p_status IN ('Verified','Closed') THEN v_actor ELSE verified_by END,
         verified_at = CASE WHEN p_status IN ('Verified','Closed') THEN now() ELSE verified_at END,
         verified_date = CASE WHEN p_status IN ('Verified','Closed') THEN now() ELSE verified_date END,
         closure_notes = CASE WHEN p_status IN ('Closed','Cancelled') THEN v_notes ELSE closure_notes END,
         closure_date = CASE WHEN p_status = 'Closed' THEN now() ELSE closure_date END,
         cancelled_reason = CASE WHEN p_status = 'Cancelled' THEN v_notes ELSE cancelled_reason END,
         cancelled_at = CASE WHEN p_status = 'Cancelled' THEN now() ELSE cancelled_at END,
         cancelled_by = CASE WHEN p_status = 'Cancelled' THEN v_actor ELSE cancelled_by END,
         updated_at = now(),
         updated_by = v_actor
   WHERE id = p_action_id;

  RETURN jsonb_build_object('success', true, 'status', p_status, 'action_id', p_action_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ia_progress_corrective_action(uuid, text, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ia_progress_corrective_action(uuid, text, text, date, text) TO authenticated;