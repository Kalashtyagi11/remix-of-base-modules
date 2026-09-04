/**
 * INTERNAL AUDIT — CENTRAL FORMAL COMMUNICATION DOCUMENT POLICY.
 *
 * One authoritative answer to the question: "when Internal Audit sends this
 * business communication, which formal document must travel with it?"
 *
 * Attachment rules are NEVER scattered across React screens. Screens ask this
 * module; the module resolves the exact sealed artifact from the existing
 * governed register (`ia_document_artifact`) and hands back a governed
 * attachment id for the existing Omni-Comms façade. No second communication
 * engine, no second document store, no bytes ever produced at send time when a
 * sealed artifact already exists.
 *
 * Defect: IA-FULL-E2E-024 — several engagement-stage communications emitted
 * successfully with no governed attachment even though the business act
 * requires a formal document (Audit Intimation, Document Request, Draft Report
 * circulation, Exit Meeting pack, Final Report issue from the generic stage
 * dialog).
 */
import { supabase } from '@/integrations/supabase/client';
import { resolveBusinessCommunicationScope } from '@/platform/omni-comms/integrations/business/businessScopeResolver';
import { INTERNAL_AUDIT_MODULE_CODE } from '@/platform/omni-comms/integrations/business/internal-audit/internalAuditCommunicationCatalogue';
import { IA_ARTIFACT_BUCKET } from './reportDistributionCommunicationService';

export type ArtifactRequirement = 'NONE' | 'OPTIONAL' | 'REQUIRED';

export interface AuditDocumentPolicyEntry {
  /** Catalogued Omni-Comms event code. */
  eventCode: string;
  /** Plain-language name of the formal document. */
  documentLabel: string;
  /** Governed artifact type stored on `ia_document_artifact.artifact_type`. */
  artifactType: string;
  /** Entity the artifact belongs to (`ia_audit_engagements`, `ia_audit_report`, …). */
  sourceEntityType: string;
  /** Default requirement before organisation configuration is applied. */
  defaultRequirement: ArtifactRequirement;
  /** Whether the organisation may raise/lower the requirement in configuration. */
  configurable: boolean;
  /**
   * Can this screen produce the document itself from the approved letter
   * template, or must an upstream business stage produce it first?
   */
  generation: 'letter' | 'upstream_stage';
  /** Business stage the user must complete when `upstream_stage` is missing. */
  upstreamStageLabel?: string;
  /** May the user add extra governed attachments? */
  supplementalAllowed: boolean;
  /** Classification applied when the document is sealed. */
  classification: 'internal' | 'confidential';
}

/** Configuration key for an organisation override of a requirement. */
export function documentPolicyConfigKey(eventCode: string): string {
  return `comm.document.${eventCode}.requirement`;
}

export const IA_COMMUNICATION_DOCUMENT_POLICY: Record<string, AuditDocumentPolicyEntry> = {
  'INTERNAL_AUDIT.PLAN.BOARD_REVIEW': {
    eventCode: 'INTERNAL_AUDIT.PLAN.BOARD_REVIEW',
    documentLabel: 'Review Plan / Board Pack',
    artifactType: 'annual_plan_board_pack',
    sourceEntityType: 'ia_annual_plan',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'upstream_stage',
    upstreamStageLabel: 'Generate the Board Review pack from the Annual Plan',
    supplementalAllowed: true,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.PLAN.DISTRIBUTED': {
    eventCode: 'INTERNAL_AUDIT.PLAN.DISTRIBUTED',
    documentLabel: 'Approved Annual Audit Plan',
    artifactType: 'annual_plan',
    sourceEntityType: 'ia_annual_plan',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'upstream_stage',
    upstreamStageLabel: 'Approve the Annual Plan, then generate the plan PDF',
    supplementalAllowed: true,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.ENGAGEMENT.INTIMATION_ISSUED': {
    eventCode: 'INTERNAL_AUDIT.ENGAGEMENT.INTIMATION_ISSUED',
    documentLabel: 'Audit Intimation / Engagement Letter',
    artifactType: 'audit_intimation_letter',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.ENGAGEMENT.SCHEDULED': {
    eventCode: 'INTERNAL_AUDIT.ENGAGEMENT.SCHEDULED',
    documentLabel: 'Scope / Terms of Reference',
    artifactType: 'engagement_scope_notice',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'REQUIRED',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.REQUEST.ISSUED': {
    eventCode: 'INTERNAL_AUDIT.REQUEST.ISSUED',
    documentLabel: 'Document Request Letter',
    artifactType: 'document_request_letter',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'REQUIRED',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.REQUEST.REMINDER': {
    eventCode: 'INTERNAL_AUDIT.REQUEST.REMINDER',
    documentLabel: 'Document Request Letter',
    artifactType: 'document_request_letter',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'OPTIONAL',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.ENGAGEMENT.ENTRANCE_MEETING': {
    eventCode: 'INTERNAL_AUDIT.ENGAGEMENT.ENTRANCE_MEETING',
    documentLabel: 'Entrance Meeting Notice / Agenda',
    artifactType: 'entrance_meeting_notice',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'OPTIONAL',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.QUERY.ISSUED': {
    eventCode: 'INTERNAL_AUDIT.QUERY.ISSUED',
    documentLabel: 'Audit Query Note',
    artifactType: 'audit_query_note',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'OPTIONAL',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.QUERY.CLARIFICATION_REQUESTED': {
    eventCode: 'INTERNAL_AUDIT.QUERY.CLARIFICATION_REQUESTED',
    documentLabel: 'Audit Query Note',
    artifactType: 'audit_query_note',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'OPTIONAL',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.REPORT.DRAFT_CIRCULATED': {
    eventCode: 'INTERNAL_AUDIT.REPORT.DRAFT_CIRCULATED',
    documentLabel: 'Draft Audit Report',
    artifactType: 'draft_audit_report',
    sourceEntityType: 'ia_audit_report',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'upstream_stage',
    upstreamStageLabel: 'Produce the Draft Report in the Report Center, then circulate it',
    supplementalAllowed: false,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.ENGAGEMENT.EXIT_MEETING': {
    eventCode: 'INTERNAL_AUDIT.ENGAGEMENT.EXIT_MEETING',
    documentLabel: 'Exit Meeting Pack (Draft Findings)',
    artifactType: 'exit_meeting_pack',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'REQUIRED',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.REPORT.ISSUED': {
    eventCode: 'INTERNAL_AUDIT.REPORT.ISSUED',
    documentLabel: 'Issued Final Audit Report',
    artifactType: 'final_audit_report',
    sourceEntityType: 'ia_audit_report',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'upstream_stage',
    upstreamStageLabel: 'Issue the Final Report in the Report Center, then distribute it',
    supplementalAllowed: false,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.ACTION.ASSIGNED': {
    eventCode: 'INTERNAL_AUDIT.ACTION.ASSIGNED',
    documentLabel: 'Secure portal link only',
    artifactType: 'none',
    sourceEntityType: 'ia_action_tracking',
    defaultRequirement: 'NONE',
    configurable: false,
    generation: 'letter',
    supplementalAllowed: false,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.ACTION.DUE_SOON': {
    eventCode: 'INTERNAL_AUDIT.ACTION.DUE_SOON',
    documentLabel: 'Secure portal link only',
    artifactType: 'none',
    sourceEntityType: 'ia_action_tracking',
    defaultRequirement: 'NONE',
    configurable: false,
    generation: 'letter',
    supplementalAllowed: false,
    classification: 'internal',
  },
  'INTERNAL_AUDIT.FOLLOWUP.REPORT_ISSUED': {
    eventCode: 'INTERNAL_AUDIT.FOLLOWUP.REPORT_ISSUED',
    documentLabel: 'Follow-Up Audit Report',
    artifactType: 'follow_up_report',
    sourceEntityType: 'ia_audit_report',
    defaultRequirement: 'REQUIRED',
    configurable: false,
    generation: 'upstream_stage',
    upstreamStageLabel: 'Issue the Follow-Up Report, then distribute it',
    supplementalAllowed: false,
    classification: 'confidential',
  },
  'INTERNAL_AUDIT.ENGAGEMENT.CLOSED': {
    eventCode: 'INTERNAL_AUDIT.ENGAGEMENT.CLOSED',
    documentLabel: 'Closure Memorandum',
    artifactType: 'closure_memorandum',
    sourceEntityType: 'ia_audit_engagements',
    defaultRequirement: 'OPTIONAL',
    configurable: true,
    generation: 'letter',
    supplementalAllowed: true,
    classification: 'internal',
  },
};

/** Management Status Report reuses the sealed IA-MSR snapshot artifact. */
export const IA_MSR_DOCUMENT_POLICY: AuditDocumentPolicyEntry = {
  eventCode: 'INTERNAL_AUDIT.REPORT.ISSUED',
  documentLabel: 'Audit Plan Management Status Report',
  artifactType: 'management_status_report',
  sourceEntityType: 'ia_management_status_report',
  defaultRequirement: 'REQUIRED',
  configurable: false,
  generation: 'upstream_stage',
  upstreamStageLabel: 'Generate the status snapshot, then distribute it',
  supplementalAllowed: false,
  classification: 'confidential',
};

export interface ResolvedArtifact {
  artifactId: string;
  attachmentId: string | null;
  documentNumber: string | null;
  fileName: string;
  versionNumber: number;
  status: string;
  byteSize: number;
  checksum: string;
  classification: string;
  storagePath: string;
  generatedAt: string | null;
  issuedAt: string | null;
}

export interface ResolvedCommunicationDocument {
  policy: AuditDocumentPolicyEntry | null;
  requirement: ArtifactRequirement;
  requirementSource: 'default' | 'configuration';
  artifact: ResolvedArtifact | null;
  /** True when nothing may be sent until a document exists. */
  blocksDistribution: boolean;
  /** Corrective action label for the user, when blocked. */
  correctiveAction: 'generate_document' | 'complete_stage' | null;
  code: string | null;
}

async function readConfiguredRequirement(
  eventCode: string,
): Promise<ArtifactRequirement | null> {
  const { data } = await supabase
    .from('ia_audit_config')
    .select('config_value')
    .eq('config_key', documentPolicyConfigKey(eventCode))
    .maybeSingle();
  const value = String((data as { config_value?: string } | null)?.config_value ?? '')
    .trim()
    .toUpperCase();
  return value === 'REQUIRED' || value === 'OPTIONAL' || value === 'NONE' ? value : null;
}

/** Latest sealed artifact for an entity + document type. Never regenerated. */
export async function findSealedArtifact(
  sourceEntityType: string,
  sourceEntityId: string,
  artifactType: string,
): Promise<ResolvedArtifact | null> {
  const { data } = await supabase
    .from('ia_document_artifact')
    .select('*')
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .eq('artifact_type', artifactType)
    .eq('status', 'Sealed')
    .is('superseded_at', null)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, any>;
  return {
    artifactId: row.id,
    attachmentId: null,
    documentNumber: row.file_name?.replace(/\.pdf$/i, '') ?? null,
    fileName: row.file_name,
    versionNumber: Number(row.version_number ?? 1),
    status: row.status,
    byteSize: Number(row.byte_size ?? 0),
    checksum: row.checksum_sha256,
    classification: row.classification,
    storagePath: row.storage_path,
    generatedAt: row.generated_at ?? null,
    issuedAt: row.issued_at ?? null,
  };
}

/**
 * Register (or re-register) a sealed artifact in the governed attachment
 * registry so it can be carried by the existing Omni-Comms façade.
 */
export async function registerArtifactAttachment(
  artifact: ResolvedArtifact,
): Promise<{ attachmentId: string | null; code: string | null }> {
  const scope = await resolveBusinessCommunicationScope({ moduleCode: INTERNAL_AUDIT_MODULE_CODE });
  if (!scope.organizationId) return { attachmentId: null, code: 'organization_unresolved' };

  const { data, error } = await supabase.rpc('omni_comms_register_attachment', {
    p_organization_id: scope.organizationId,
    p_owner_module_code: INTERNAL_AUDIT_MODULE_CODE,
    p_source_entity_type: 'ia_document_artifact',
    p_source_entity_id: artifact.artifactId,
    p_storage_bucket: IA_ARTIFACT_BUCKET,
    p_storage_path: artifact.storagePath,
    p_file_name: artifact.fileName,
    p_content_type: 'application/pdf',
    p_byte_size: artifact.byteSize,
    p_checksum_sha256: artifact.checksum,
    p_classification: artifact.classification || 'confidential',
    p_department_id: scope.departmentId,
  } as never);

  if (error) return { attachmentId: null, code: 'attachment_registration_failed' };
  const row = (data ?? {}) as { ok?: boolean; attachment_id?: string; code?: string };
  if (!row.ok || !row.attachment_id) {
    return { attachmentId: null, code: row.code ?? 'attachment_registration_failed' };
  }
  return { attachmentId: row.attachment_id, code: null };
}

/**
 * THE central policy call.
 *
 * Given the business event and the entity it concerns, decide whether a formal
 * document is required, find the exact sealed document, and make it carriable.
 */
export async function resolveAuditCommunicationArtifacts(
  eventCode: string,
  entityId: string,
  context?: { policyOverride?: AuditDocumentPolicyEntry; skipAttachmentRegistration?: boolean },
): Promise<ResolvedCommunicationDocument> {
  const policy =
    context?.policyOverride ??
    IA_COMMUNICATION_DOCUMENT_POLICY[String(eventCode ?? '').trim().toUpperCase()] ??
    null;

  if (!policy) {
    return {
      policy: null,
      requirement: 'NONE',
      requirementSource: 'default',
      artifact: null,
      blocksDistribution: false,
      correctiveAction: null,
      code: 'event_not_policy_mapped',
    };
  }

  let requirement = policy.defaultRequirement;
  let requirementSource: 'default' | 'configuration' = 'default';
  if (policy.configurable) {
    const configured = await readConfiguredRequirement(policy.eventCode);
    if (configured) {
      requirement = configured;
      requirementSource = 'configuration';
    }
  }

  if (requirement === 'NONE' || policy.artifactType === 'none') {
    return {
      policy,
      requirement: 'NONE',
      requirementSource,
      artifact: null,
      blocksDistribution: false,
      correctiveAction: null,
      code: null,
    };
  }

  const artifact = await findSealedArtifact(policy.sourceEntityType, entityId, policy.artifactType);

  if (!artifact) {
    return {
      policy,
      requirement,
      requirementSource,
      artifact: null,
      blocksDistribution: requirement === 'REQUIRED',
      correctiveAction: policy.generation === 'letter' ? 'generate_document' : 'complete_stage',
      code: 'artifact_missing',
    };
  }

  if (context?.skipAttachmentRegistration) {
    return {
      policy,
      requirement,
      requirementSource,
      artifact,
      blocksDistribution: false,
      correctiveAction: null,
      code: null,
    };
  }

  const reg = await registerArtifactAttachment(artifact);
  return {
    policy,
    requirement,
    requirementSource,
    artifact: { ...artifact, attachmentId: reg.attachmentId },
    blocksDistribution: requirement === 'REQUIRED' && !reg.attachmentId,
    correctiveAction: null,
    code: reg.code,
  };
}

/** Signed, time-limited link used for the In-App "View Document" destination. */
export async function createArtifactViewLink(
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(IA_ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
