/**
 * Central registry of system-code entities that must be auto-generated
 * by the central numbering engine (core_number_sequence + core_generate_number).
 *
 * Only entities with their OWN surrogate code column are listed. Join /
 * rule tables that are keyed by composite fields (e.g. lg_stage_action_rule,
 * lg_stage_document_rule, lg_workflow_policy) intentionally have no
 * surrogate code and are not part of this registry.
 *
 * Business/reference codes (statute, bank, court, ISO) live in
 * `BUSINESS_CODE_FIELDS` below and remain user-controlled input.
 */

export interface AutoCodeEntity {
  key: string;
  moduleCode: string;
  entityType: string;
  label: string;
  pattern: string;
  target: { table: string; column: string };
  needsDepartmentCode?: boolean;
  /** Per-entity admin override — allow manual code entry behind a feature flag. Off by default. */
  allowOverride?: boolean;
}

export const AUTO_CODE_REGISTRY: Record<string, AutoCodeEntity> = {
  TEXT_BLOCK: {
    key: "TEXT_BLOCK",
    moduleCode: "CORE",
    entityType: "TEXT_BLOCK",
    label: "Text Block",
    pattern: "TB-{DEPARTMENT}-{SEQ}",
    target: { table: "core_text_block", column: "text_block_code" },
    needsDepartmentCode: true,
    allowOverride: false,
  },
  TEMPLATE: {
    key: "TEMPLATE",
    moduleCode: "CORE",
    entityType: "TEMPLATE",
    label: "Template",
    pattern: "TPL-{DEPARTMENT}-{SEQ}",
    target: { table: "core_template", column: "code" },
    needsDepartmentCode: true,
    allowOverride: true, // legacy imports need it
  },
  TEMPLATE_CATEGORY: {
    key: "TEMPLATE_CATEGORY",
    moduleCode: "CORE",
    entityType: "TEMPLATE_CATEGORY",
    label: "Template Category",
    pattern: "TCAT-{SEQ}",
    target: { table: "core_template_category", column: "code" },
    allowOverride: false,
  },
  TEMPLATE_TOKEN: {
    key: "TEMPLATE_TOKEN",
    moduleCode: "CORE",
    entityType: "TEMPLATE_TOKEN",
    label: "Template Token",
    pattern: "TTOK-{DEPARTMENT}-{SEQ}",
    target: { table: "core_template_token", column: "token_code" },
    needsDepartmentCode: true,
    allowOverride: false,
  },
  TEMPLATE_CHANNEL: {
    key: "TEMPLATE_CHANNEL",
    moduleCode: "CORE",
    entityType: "TEMPLATE_CHANNEL",
    label: "Template Channel",
    pattern: "CH-{SEQ}",
    target: { table: "core_template_channel", column: "code" },
    allowOverride: false,
  },
  TEMPLATE_LAYOUT: {
    key: "TEMPLATE_LAYOUT",
    moduleCode: "CORE",
    entityType: "TEMPLATE_LAYOUT",
    label: "Template Layout",
    pattern: "TLAY-{SEQ}",
    target: { table: "core_template_layout", column: "code" },
    allowOverride: false,
  },
  LETTERHEAD: {
    key: "LETTERHEAD",
    moduleCode: "CORE",
    entityType: "LETTERHEAD",
    label: "Letterhead",
    pattern: "LH-{DEPARTMENT}-{SEQ}",
    target: { table: "comm_letterhead", column: "code" },
    needsDepartmentCode: true,
    allowOverride: false,
  },
  MEDIA_ASSET: {
    key: "MEDIA_ASSET",
    moduleCode: "CORE",
    entityType: "MEDIA_ASSET",
    label: "Media Asset",
    pattern: "MA-{DEPARTMENT}-{SEQ}",
    target: { table: "comm_media_asset", column: "asset_code" },
    needsDepartmentCode: true,
    allowOverride: false,
  },
  LEGAL_STAGE: {
    key: "LEGAL_STAGE",
    moduleCode: "LEGAL",
    entityType: "STAGE",
    label: "Legal Stage",
    pattern: "LGS-{SEQ}",
    target: { table: "lg_case_source_stage", column: "stage_code" },
    allowOverride: true, // source system may dictate a specific stage_code
  },
  FEE_RULE: {
    key: "FEE_RULE",
    moduleCode: "LEGAL",
    entityType: "FEE_RULE",
    label: "Fee Rule",
    pattern: "FEE-{SEQ}",
    target: { table: "lg_fee_rule", column: "fee_rule_code" },
    allowOverride: false,
  },
  FEE_WAIVER_POLICY: {
    key: "FEE_WAIVER_POLICY",
    moduleCode: "LEGAL",
    entityType: "FEE_WAIVER",
    label: "Fee Waiver Policy",
    pattern: "FWP-{SEQ}",
    target: { table: "lg_fee_waiver_policy", column: "policy_code" },
    allowOverride: false,
  },
  IA_ENGAGEMENT: {
    key: "IA_ENGAGEMENT",
    moduleCode: "INTERNAL_AUDIT",
    entityType: "ENGAGEMENT",
    label: "Internal Audit Engagement",
    pattern: "IA-ENG-SKN-{YYYY}-{SEQ}",
    target: { table: "ia_audit_engagements", column: "engagement_code" },
    allowOverride: false,
  },
};

/**
 * Composite-key rule tables — no surrogate code, not part of auto-generation.
 * Documented here so future contributors don't mistakenly add a manual code input.
 */
export const COMPOSITE_KEY_RULE_TABLES: ReadonlyArray<string> = [
  "lg_stage_action_rule",       // keyed by (case_type_code, stage_code, action_code)
  "lg_stage_document_rule",     // keyed by (case_type_code, stage_code, document_type_code)
  "lg_stage_transition_rule",   // keyed by (case_type_code, from_stage_code, to_stage_code)
  "lg_workflow_policy",         // keyed by (action_code, ...)
  "lg_routing_policy",          // keyed by strategy + workbasket
  "legal_referral_sla_rule",    // keyed by referral scope
];

/** Business / reference codes that MUST remain user-controlled input. */
export const BUSINESS_CODE_FIELDS: ReadonlyArray<{ table: string; column: string; reason: string }> = [
  { table: "core_legal_reference", column: "reference_code", reason: "Statute / regulation identifier" },
  { table: "lg_court", column: "code", reason: "External court identifier" },
  { table: "lg_court_venue", column: "code", reason: "External venue identifier" },
  { table: "bn_bank_master", column: "bank_code", reason: "Regulator-assigned bank code" },
  { table: "bn_bank_branch", column: "branch_code", reason: "Regulator-assigned branch code" },
  { table: "bn_reason_code", column: "code", reason: "Regulatory reason code" },
  { table: "bn_product", column: "product_code", reason: "Externally published product code" },
];

export function getAutoCodeEntity(key: string): AutoCodeEntity | undefined {
  return AUTO_CODE_REGISTRY[key];
}
