-- =====================================================================
-- INTERNAL AUDIT — Governed formal document artifact model (IA-FULL-E2E-016)
-- One reusable, versioned, sealable artifact register for every formal
-- Internal Audit document (report, follow-up report, engagement letter …).
-- The Annual Plan artifact table stays exactly as it is.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ia_document_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  artifact_type text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Candidate',
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  storage_bucket text NOT NULL DEFAULT 'ia-artifacts',
  storage_path text NOT NULL,
  byte_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,
  classification text NOT NULL DEFAULT 'internal',
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by text,
  approved_at timestamptz,
  issued_by text,
  issued_at timestamptz,
  supersedes_artifact_id uuid REFERENCES public.ia_document_artifact(id),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_document_artifact_status_chk
    CHECK (status = ANY (ARRAY['Candidate','Sealed','Superseded','Withdrawn'])),
  CONSTRAINT ia_document_artifact_class_chk
    CHECK (classification = ANY (ARRAY['public','internal','confidential','restricted'])),
  CONSTRAINT ia_document_artifact_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ia_document_artifact_size_chk CHECK (byte_size > 0 AND byte_size <= 26214400),
  CONSTRAINT ia_document_artifact_version_uk
    UNIQUE (source_entity_type, source_entity_id, artifact_type, version_number)
);

CREATE INDEX IF NOT EXISTS ia_document_artifact_source_ix
  ON public.ia_document_artifact (source_entity_type, source_entity_id, artifact_type, version_number DESC);

GRANT SELECT ON public.ia_document_artifact TO authenticated;
GRANT ALL ON public.ia_document_artifact TO service_role;

ALTER TABLE public.ia_document_artifact ENABLE ROW LEVEL SECURITY;

CREATE POLICY ia_document_artifact_read ON public.ia_document_artifact
  FOR SELECT TO authenticated USING (public.ia_is_ia_user());

-- Writes go exclusively through the governed RPC below.

-- Sealed bytes are immutable: only supersession / withdrawal metadata may change.
CREATE OR REPLACE FUNCTION public.zz_ia_document_artifact_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'Sealed' THEN
      RAISE EXCEPTION 'IA_ARTIFACT_SEALED: a sealed audit document cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('Sealed','Superseded') THEN
    IF NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id
       OR NEW.artifact_type IS DISTINCT FROM OLD.artifact_type THEN
      RAISE EXCEPTION 'IA_ARTIFACT_SEALED: the sealed document content cannot be altered';
    END IF;
    IF OLD.status = 'Sealed' AND NEW.status NOT IN ('Sealed','Superseded','Withdrawn') THEN
      RAISE EXCEPTION 'IA_ARTIFACT_SEALED: invalid lifecycle transition from Sealed';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_ia_document_artifact_guard ON public.ia_document_artifact;
CREATE TRIGGER zz_ia_document_artifact_guard
  BEFORE UPDATE OR DELETE ON public.ia_document_artifact
  FOR EACH ROW EXECUTE FUNCTION public.zz_ia_document_artifact_guard();

-- Governed registration / sealing.
CREATE OR REPLACE FUNCTION public.ia_register_document_artifact(
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_artifact_type text,
  p_file_name text,
  p_storage_path text,
  p_byte_size bigint,
  p_checksum_sha256 text,
  p_seal boolean DEFAULT false,
  p_mime_type text DEFAULT 'application/pdf',
  p_classification text DEFAULT 'internal'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor text := COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
  v_existing public.ia_document_artifact%ROWTYPE;
  v_version integer;
  v_id uuid;
BEGIN
  IF NOT public.ia_is_ia_user() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authorised');
  END IF;
  IF p_source_entity_id IS NULL OR COALESCE(btrim(p_artifact_type), '') = ''
     OR COALESCE(btrim(p_storage_path), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_artifact_input');
  END IF;

  -- Content addressed: the same bytes for the same entity are one artifact.
  SELECT * INTO v_existing
  FROM public.ia_document_artifact
  WHERE source_entity_type = p_source_entity_type
    AND source_entity_id = p_source_entity_id
    AND artifact_type = p_artifact_type
    AND checksum_sha256 = lower(p_checksum_sha256)
    AND status <> 'Withdrawn'
  ORDER BY version_number DESC
  LIMIT 1;

  IF FOUND THEN
    IF p_seal AND v_existing.status = 'Candidate' THEN
      UPDATE public.ia_document_artifact
         SET status = 'Sealed', issued_by = v_actor, issued_at = now()
       WHERE id = v_existing.id;
    END IF;
    SELECT * INTO v_existing FROM public.ia_document_artifact WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'artifact_id', v_existing.id,
      'version_number', v_existing.version_number, 'status', v_existing.status, 'reused', true);
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_version
  FROM public.ia_document_artifact
  WHERE source_entity_type = p_source_entity_type
    AND source_entity_id = p_source_entity_id
    AND artifact_type = p_artifact_type;

  INSERT INTO public.ia_document_artifact (
    source_entity_type, source_entity_id, artifact_type, version_number, status,
    file_name, mime_type, storage_path, byte_size, checksum_sha256, classification,
    generated_by, issued_by, issued_at,
    supersedes_artifact_id
  ) VALUES (
    p_source_entity_type, p_source_entity_id, p_artifact_type, v_version,
    CASE WHEN p_seal THEN 'Sealed' ELSE 'Candidate' END,
    p_file_name, COALESCE(p_mime_type, 'application/pdf'), p_storage_path,
    p_byte_size, lower(p_checksum_sha256), COALESCE(p_classification, 'internal'),
    v_actor,
    CASE WHEN p_seal THEN v_actor END,
    CASE WHEN p_seal THEN now() END,
    (SELECT id FROM public.ia_document_artifact
      WHERE source_entity_type = p_source_entity_type
        AND source_entity_id = p_source_entity_id
        AND artifact_type = p_artifact_type
        AND status = 'Sealed'
      ORDER BY version_number DESC LIMIT 1)
  ) RETURNING id INTO v_id;

  IF p_seal THEN
    UPDATE public.ia_document_artifact
       SET status = 'Superseded', superseded_at = now()
     WHERE source_entity_type = p_source_entity_type
       AND source_entity_id = p_source_entity_id
       AND artifact_type = p_artifact_type
       AND id <> v_id
       AND status = 'Sealed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'artifact_id', v_id, 'version_number', v_version,
    'status', CASE WHEN p_seal THEN 'Sealed' ELSE 'Candidate' END, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.ia_register_document_artifact(text,uuid,text,text,text,bigint,text,boolean,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.ia_register_document_artifact(text,uuid,text,text,text,bigint,text,boolean,text,text) TO authenticated;

-- =====================================================================
-- Channel-appropriate attachment requirement.
-- A mandatory PDF must block Email when missing, but must NOT make a
-- perfectly valid In-App notification undeliverable.
-- =====================================================================
ALTER TABLE public.omni_comms_request_attachment
  ADD COLUMN IF NOT EXISTS requirement_scope text NOT NULL DEFAULT 'all_channels';

ALTER TABLE public.omni_comms_request_attachment
  DROP CONSTRAINT IF EXISTS omni_comms_request_attachment_reqscope_chk;
ALTER TABLE public.omni_comms_request_attachment
  ADD CONSTRAINT omni_comms_request_attachment_reqscope_chk
  CHECK (requirement_scope = ANY (ARRAY['all_channels','attachment_capable_channels']));

CREATE OR REPLACE FUNCTION public.omni_comms_priv_attach_request_attachments(
  p_request_id uuid,
  p_organization_id uuid,
  p_attachments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb;
  v_att public.omni_comms_attachment%ROWTYPE;
  v_ordinal integer := 0;
  v_pinned integer := 0;
  v_total bigint := 0;
BEGIN
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'pinned', 0);
  END IF;

  IF jsonb_array_length(p_attachments) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attachment_limit_exceeded');
  END IF;

  IF EXISTS (SELECT 1 FROM public.omni_comms_request_attachment WHERE request_id = p_request_id) THEN
    SELECT count(*) INTO v_pinned FROM public.omni_comms_request_attachment WHERE request_id = p_request_id;
    RETURN jsonb_build_object('ok', true, 'pinned', v_pinned, 'replayed', true);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attachments)
  LOOP
    v_ordinal := v_ordinal + 1;
    SELECT * INTO v_att
    FROM public.omni_comms_attachment
    WHERE id = (v_item->>'attachment_id')::uuid
      AND organization_id = p_organization_id
      AND status = 'registered';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'attachment_not_available');
    END IF;

    v_total := v_total + v_att.byte_size;

    INSERT INTO public.omni_comms_request_attachment (
      request_id, attachment_id, ordinal, disposition, required_for_delivery,
      requirement_scope, pinned_checksum_sha256, pinned_byte_size, pinned_file_name
    ) VALUES (
      p_request_id, v_att.id, v_ordinal,
      COALESCE(v_item->>'disposition', 'attachment'),
      COALESCE((v_item->>'required_for_delivery')::boolean, false),
      CASE WHEN COALESCE(v_item->>'requirement_scope','all_channels') = 'attachment_capable_channels'
           THEN 'attachment_capable_channels' ELSE 'all_channels' END,
      v_att.checksum_sha256, v_att.byte_size, v_att.file_name
    );
    v_pinned := v_pinned + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'pinned', v_pinned, 'total_bytes', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.omni_comms_priv_resolve_message_attachments(
  p_message_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg public.omni_comms_message%ROWTYPE;
  v_policy public.omni_comms_channel_attachment_policy%ROWTYPE;
  v_row record;
  v_required boolean;
  v_included integer := 0;
  v_dropped integer := 0;
  v_blocked integer := 0;
  v_bytes bigint := 0;
  v_outcome text;
  v_reason text;
BEGIN
  SELECT * INTO v_msg FROM public.omni_comms_message WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'message_not_found');
  END IF;

  SELECT * INTO v_policy FROM public.omni_comms_channel_attachment_policy WHERE channel = v_msg.channel;
  IF NOT FOUND THEN
    v_policy.supports_attachments := false;
    v_policy.max_attachments := 0;
    v_policy.max_total_bytes := 0;
  END IF;

  DELETE FROM public.omni_comms_message_attachment WHERE message_id = p_message_id;

  FOR v_row IN
    SELECT ra.*, a.content_type
    FROM public.omni_comms_request_attachment ra
    JOIN public.omni_comms_attachment a ON a.id = ra.attachment_id
    WHERE ra.request_id = v_msg.request_id
    ORDER BY ra.ordinal
  LOOP
    v_reason := NULL;
    -- Channel-appropriate requirement: a document that is mandatory for
    -- attachment-carrying channels does not block channels that legitimately
    -- deliver a secure link instead (in-app, SMS, push).
    v_required := v_row.required_for_delivery
      AND (COALESCE(v_row.requirement_scope, 'all_channels') = 'all_channels'
           OR v_policy.supports_attachments);

    IF NOT v_policy.supports_attachments THEN
      v_outcome := CASE WHEN v_required THEN 'blocked' ELSE 'dropped' END;
      v_reason := 'channel_does_not_support_attachments';
    ELSIF v_included >= v_policy.max_attachments THEN
      v_outcome := CASE WHEN v_required THEN 'blocked' ELSE 'dropped' END;
      v_reason := 'attachment_count_limit';
    ELSIF v_bytes + v_row.pinned_byte_size > v_policy.max_total_bytes THEN
      v_outcome := CASE WHEN v_required THEN 'blocked' ELSE 'dropped' END;
      v_reason := 'attachment_size_limit';
    ELSE
      v_outcome := 'included';
      v_bytes := v_bytes + v_row.pinned_byte_size;
    END IF;

    INSERT INTO public.omni_comms_message_attachment (
      message_id, request_attachment_id, attachment_id, channel, ordinal,
      outcome, outcome_reason, checksum_sha256, byte_size, file_name, content_type
    ) VALUES (
      p_message_id, v_row.id, v_row.attachment_id, v_msg.channel, v_row.ordinal,
      v_outcome, v_reason, v_row.pinned_checksum_sha256, v_row.pinned_byte_size,
      v_row.pinned_file_name, v_row.content_type
    );

    IF v_outcome = 'included' THEN v_included := v_included + 1;
    ELSIF v_outcome = 'dropped' THEN v_dropped := v_dropped + 1;
    ELSE v_blocked := v_blocked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_blocked = 0,
    'code', CASE WHEN v_blocked > 0 THEN 'attachment_required_unsupported' ELSE NULL END,
    'included', v_included, 'dropped', v_dropped, 'blocked', v_blocked,
    'total_bytes', v_bytes
  );
END;
$$;