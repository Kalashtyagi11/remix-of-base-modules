import { supabase } from "@/integrations/supabase/client";
import { logLgActivity } from "@/services/legal/lgAuditService";
import { assertLgEnforcementTransition, type LgEnforcementStatus } from "@/services/legal/lgEnforcementStateMachine";
import type { LgEnforcementRecord } from "@/types/legal/judicial";
import { allocatePayment } from "@/services/legal/lgLiabilityService";

const sb = supabase as any;

export interface CreateEnforcementInput {
  case_id: string;
  order_id?: string | null;
  enforcement_type: string;
  status?: LgEnforcementStatus;
  requested_date?: string | null;
  officer_code?: string | null;
  external_agency?: string | null;
  amount_targeted?: number | null;
  remarks?: string | null;
  next_action?: string | null;
  created_by?: string | null;
  liability_ids?: string[];
}

async function nextEnforcementNo(): Promise<string> {
  try {
    const { generateNumber } = await import("@/services/core/coreNumberingService");
    const r = await generateNumber({ moduleCode: "LEGAL", entityType: "LEGAL_ENFORCEMENT", countryCode: "SKN" });
    return r.generatedNumber;
  } catch {
    return `LG-ENF-${Date.now().toString().slice(-8)}`;
  }
}

export async function listEnforcementForCase(caseId: string): Promise<LgEnforcementRecord[]> {
  const { data, error } = await sb.from("lg_enforcement_action").select("*").eq("case_id", caseId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function listEnforcementForOrder(orderId: string): Promise<LgEnforcementRecord[]> {
  const { data, error } = await sb.from("lg_enforcement_action").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEnforcement(input: CreateEnforcementInput): Promise<LgEnforcementRecord> {
  // Guard: order must be in an eligible state
  if (input.order_id) {
    const { data: ord } = await sb.from("lg_order").select("status").eq("id", input.order_id).single();
    const eligible = new Set(["GRANTED","ACTIVE","PARTIALLY_COMPLIED","BREACHED","ENFORCED"]);
    if (ord?.status && !eligible.has(ord.status)) {
      throw new Error(`Order status ${ord.status} does not permit enforcement`);
    }
  }
  const enforcement_no = await nextEnforcementNo();
  const status = input.status ?? "DRAFT";
  const { data, error } = await sb.from("lg_enforcement_action").insert({
    enforcement_no,
    case_id: input.case_id,
    order_id: input.order_id ?? null,
    enforcement_type: input.enforcement_type,
    status,
    requested_date: input.requested_date ?? new Date().toISOString().slice(0, 10),
    officer_code: input.officer_code ?? null,
    external_agency: input.external_agency ?? null,
    amount_targeted: input.amount_targeted ?? null,
    remarks: input.remarks ?? null,
    next_action: input.next_action ?? null,
    created_by: input.created_by ?? null,
  }).select("*").single();
  if (error) throw error;

  if (input.liability_ids?.length) {
    await sb.from("lg_enforcement_liability").insert(
      input.liability_ids.map((lid) => ({ enforcement_id: data.id, liability_id: lid, created_by: input.created_by ?? null })),
    );
  }

  await logLgActivity({
    lg_case_id: input.case_id,
    activity_type: "ENFORCEMENT_CREATED",
    description: `Enforcement ${enforcement_no} (${input.enforcement_type}) — ${status}`,
    performed_by: input.created_by ?? null,
    payload: { enforcement_id: data.id, order_id: input.order_id, liability_ids: input.liability_ids ?? [] },
  }).catch(() => {});

  // EPIC-06C — centralized notification dispatch
  try {
    const { dispatch } = await import("@/services/legal/lgNotificationRuleEngine");
    await dispatch("ENFORCEMENT_STARTED", {
      lg_case_id: input.case_id,
      entity_type: "LG_ENFORCEMENT",
      entity_id: data.id,
      actor_user_code: input.created_by ?? null,
      title: `Enforcement ${enforcement_no} started`,
      payload: { enforcement_id: data.id, enforcement_type: input.enforcement_type },
    });
  } catch { /* non-blocking */ }

  // EPIC-06B.1 — auto follow-up: preparation task
  try {
    const { autoTaskOnEnforcementCreated } = await import("@/services/legal/lgJudicialTaskAutomation");
    await autoTaskOnEnforcementCreated({
      case_id: input.case_id,
      enforcement_id: data.id,
      enforcement_no,
      enforcement_type: input.enforcement_type,
      created_by: input.created_by ?? null,
    });
  } catch { /* non-blocking */ }
  return data;
}

export async function changeEnforcementStatus(
  id: string,
  to: LgEnforcementStatus,
  opts?: { userCode?: string | null; note?: string | null; amountRecovered?: number | null; outcome?: string | null },
) {
  const { data: cur, error: e1 } = await sb.from("lg_enforcement_action").select("*").eq("id", id).single();
  if (e1) throw e1;
  assertLgEnforcementTransition(cur.status, to);

  const patch: Record<string, any> = { status: to, updated_by: opts?.userCode ?? null };
  const today = new Date().toISOString().slice(0, 10);
  if (to === "APPROVED" && !cur.approved_date) patch.approved_date = today;
  if ((to === "EXECUTED" || to === "PARTIALLY_EXECUTED") && !cur.execution_date) patch.execution_date = today;
  if (opts?.amountRecovered != null) patch.amount_recovered = opts.amountRecovered;
  if (opts?.outcome) patch.outcome = opts.outcome;

  const { data, error } = await sb.from("lg_enforcement_action").update(patch).eq("id", id).select("*").single();
  if (error) throw error;

  // On EXECUTED with recovered amount, best-effort allocate to first linked liability
  if ((to === "EXECUTED" || to === "PARTIALLY_EXECUTED") && (opts?.amountRecovered ?? 0) > 0) {
    try {
      const { data: links } = await sb.from("lg_enforcement_liability").select("liability_id, allocated_amount").eq("enforcement_id", id);
      if (links && links.length > 0) {
        // static import (see top of file) — avoids mixed static/dynamic chunking
        const amt = opts!.amountRecovered!;
        const perRow = links[0].allocated_amount ?? amt;
        await allocatePayment(
          links[0].liability_id,
          {
            payment_id: id,
            payment_ref: cur.enforcement_no ?? undefined,
            payment_date: today,
            allocated_amount: Math.min(perRow, amt),
            component: "PRINCIPAL",
            allocation_rule: "PRINCIPAL_FIRST",
            remarks: `Enforcement recovery ${cur.enforcement_no ?? ""}`,
          },
          opts?.userCode ?? null,
        ).catch(() => {});
      }
    } catch { /* non-blocking */ }
  }

  await logLgActivity({
    lg_case_id: cur.case_id,
    activity_type: `ENFORCEMENT_${to}`,
    description: `Enforcement ${cur.enforcement_no}: ${cur.status} → ${to}${opts?.note ? " — " + opts.note : ""}`,
    performed_by: opts?.userCode ?? null,
    payload: { enforcement_id: id, from: cur.status, to, amount_recovered: opts?.amountRecovered ?? null },
  }).catch(() => {});

  if (to === "CLOSED" || to === "FAILED") {
    try {
      const { dispatch } = await import("@/services/legal/lgNotificationRuleEngine");
      await dispatch("ENFORCEMENT_COMPLETED", {
        lg_case_id: cur.case_id,
        entity_type: "LG_ENFORCEMENT",
        entity_id: id,
        actor_user_code: opts?.userCode ?? null,
        title: `Enforcement ${cur.enforcement_no} — ${to}`,
        payload: { from: cur.status, to, amount_recovered: opts?.amountRecovered ?? null },
      });
    } catch { /* non-blocking */ }
  }
  return data;
}

export async function linkEnforcementLiability(enforcementId: string, liabilityId: string, allocated_amount?: number | null, userCode?: string | null) {
  const { error } = await sb.from("lg_enforcement_liability").upsert({ enforcement_id: enforcementId, liability_id: liabilityId, allocated_amount: allocated_amount ?? null, created_by: userCode ?? null });
  if (error) throw error;
}
export async function unlinkEnforcementLiability(enforcementId: string, liabilityId: string) {
  const { error } = await sb.from("lg_enforcement_liability").delete().eq("enforcement_id", enforcementId).eq("liability_id", liabilityId);
  if (error) throw error;
}
export async function listEnforcementLiabilities(enforcementId: string) {
  const { data, error } = await sb.from("lg_enforcement_liability").select("*, lg_recoverable_liability:liability_id(*)").eq("enforcement_id", enforcementId);
  if (error) throw error;
  return data ?? [];
}
