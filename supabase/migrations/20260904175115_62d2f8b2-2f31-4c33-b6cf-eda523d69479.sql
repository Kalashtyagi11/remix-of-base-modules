INSERT INTO public.ia_audit_config (config_key, config_value, config_type, category, display_name, description, is_editable)
VALUES
  ('comm.document.INTERNAL_AUDIT.ENGAGEMENT.SCHEDULED.requirement','REQUIRED','enum','Communication Documents','Scope / Terms of Reference document','Whether the Team & Scope notice must carry a formal scope document.',true),
  ('comm.document.INTERNAL_AUDIT.REQUEST.ISSUED.requirement','REQUIRED','enum','Communication Documents','Document Request Letter','Whether a document call-up must carry a formal request letter.',true),
  ('comm.document.INTERNAL_AUDIT.REQUEST.REMINDER.requirement','OPTIONAL','enum','Communication Documents','Document Request Reminder Letter','Whether a document-request reminder must carry the formal letter again.',true),
  ('comm.document.INTERNAL_AUDIT.ENGAGEMENT.ENTRANCE_MEETING.requirement','OPTIONAL','enum','Communication Documents','Entrance Meeting Notice / Agenda','Whether the entrance meeting invitation must carry a formal notice.',true),
  ('comm.document.INTERNAL_AUDIT.QUERY.ISSUED.requirement','OPTIONAL','enum','Communication Documents','Audit Query Note','Whether an audit query must carry a formal query note.',true),
  ('comm.document.INTERNAL_AUDIT.QUERY.CLARIFICATION_REQUESTED.requirement','OPTIONAL','enum','Communication Documents','Audit Query Clarification Note','Whether a clarification request must carry a formal query note.',true),
  ('comm.document.INTERNAL_AUDIT.ENGAGEMENT.EXIT_MEETING.requirement','REQUIRED','enum','Communication Documents','Exit Meeting Pack','Whether the exit meeting invitation must carry the draft findings pack.',true),
  ('comm.document.INTERNAL_AUDIT.ENGAGEMENT.CLOSED.requirement','OPTIONAL','enum','Communication Documents','Closure Memorandum','Whether closure communication must carry a formal closure memorandum.',true)
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ia_document_distribution_history(p_entity_id text)
RETURNS TABLE (
  request_id uuid,
  event_code text,
  requested_at timestamptz,
  request_status text,
  recipient_name text,
  recipient_email text,
  channel text,
  message_status text,
  queued_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  document_file_name text,
  document_checksum text,
  document_byte_size bigint,
  attachment_required boolean,
  attachment_outcome text,
  attachment_outcome_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    ed.code,
    r.created_at,
    r.status,
    rec.display_name,
    rec.email_destination,
    m.channel,
    m.status,
    m.queued_at,
    m.completed_at,
    m.failed_at,
    COALESCE(ma.file_name, ra.pinned_file_name),
    COALESCE(ma.checksum_sha256, ra.pinned_checksum_sha256),
    COALESCE(ma.byte_size, ra.pinned_byte_size)::bigint,
    ra.required_for_delivery,
    ma.outcome,
    ma.outcome_reason
  FROM public.omni_comms_request r
  JOIN public.omni_comms_event_definition ed ON ed.id = r.event_definition_id
  LEFT JOIN public.omni_comms_recipient rec ON rec.request_id = r.id
  LEFT JOIN public.omni_comms_message m ON m.request_id = r.id AND m.recipient_id = rec.id
  LEFT JOIN public.omni_comms_request_attachment ra ON ra.request_id = r.id
  LEFT JOIN public.omni_comms_message_attachment ma
         ON ma.message_id = m.id AND ma.request_attachment_id = ra.id
  WHERE r.caller_module_code = 'INTERNAL_AUDIT'
    AND r.caller_entity_id = p_entity_id
    AND public.ia_is_ia_user()
  ORDER BY r.created_at DESC, m.channel;
$$;

REVOKE ALL ON FUNCTION public.ia_document_distribution_history(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_document_distribution_history(text) TO authenticated;