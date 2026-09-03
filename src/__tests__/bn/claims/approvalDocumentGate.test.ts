/**
 * BN-20260903-07443 — a claim with an outstanding MANDATORY document
 * (DOC-002 Birth Certificate) was approved and paid, because the workbench
 * "Approve" button calls `approveClaim`, which did not run the approval
 * precondition gate at all.
 *
 * These tests assert the gate now refuses on that path, and that nothing
 * downstream (decision row, status change, orchestration) is reached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({
      data: { id: 'claim-1', status: 'DECISION', product_version_id: 'pv-1', product_id: 'p-1' },
      error: null,
    }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert: (...args: any[]) => { insertSpy(...args); return builder; },
    update: (...args: any[]) => { updateSpy(...args); return builder; },
  };
  return { supabase: { from: () => builder, rpc: () => Promise.resolve({ data: null, error: null }) } };
});

const checkApprovalPreconditions = vi.fn();
vi.mock('@/services/bn/claims/approvalPreconditions', () => ({
  checkApprovalPreconditions: (...a: any[]) => checkApprovalPreconditions(...a),
  describeApprovalBlockers: (blockers: any[]) =>
    `Cannot approve — ${blockers.length} condition(s) not met:\n${blockers.map((b) => b.message).join('\n')}`,
}));

vi.mock('@/services/bn/audit/bnAuditService', () => ({
  auditClaimAction: vi.fn(), auditAwardAction: vi.fn(),
}));
vi.mock('@/services/bn/workflow/routeClaimAfterStatusChange', () => ({
  routeClaimAfterStatusChange: vi.fn(),
}));
const resolveApprovalRouting = vi.fn();
vi.mock('@/services/bn/approvalLevelService', () => ({
  resolveApprovalRouting: (...a: any[]) => resolveApprovalRouting(...a),
  getUserRoleNames: vi.fn(async () => ['BN_MANAGER']),
  getTransitionSideEffect: vi.fn(),
  assignClaimToWorkbasket: vi.fn(),
}));

const OUTSTANDING_DOC = {
  ok: false,
  controls: {},
  blockers: [{
    code: 'DOCUMENTS_OUTSTANDING',
    message: '1 mandatory document(s) are neither verified nor formally waived: DOC-002 Birth Certificate.',
  }],
};

describe('approval document gate', () => {
  beforeEach(() => {
    insertSpy.mockClear();
    updateSpy.mockClear();
    resolveApprovalRouting.mockReset();
    checkApprovalPreconditions.mockReset();
  });

  it('refuses approval when a mandatory document is outstanding', async () => {
    checkApprovalPreconditions.mockResolvedValue(OUTSTANDING_DOC);
    const { approveClaim } = await import('@/services/bn/postApprovalOrchestrator');

    await expect(approveClaim('claim-1', 'USER1')).rejects.toThrow(/Birth Certificate/);
  });

  it('writes nothing and never resolves routing when refused', async () => {
    checkApprovalPreconditions.mockResolvedValue(OUTSTANDING_DOC);
    const { approveClaim } = await import('@/services/bn/postApprovalOrchestrator');

    await expect(approveClaim('claim-1', 'USER1')).rejects.toThrow();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    // The recommendation path is behind the gate too — a non-compliant claim
    // cannot be recommended upward either.
    expect(resolveApprovalRouting).not.toHaveBeenCalled();
  });

  it('runs the gate before any approval work', async () => {
    checkApprovalPreconditions.mockResolvedValue(OUTSTANDING_DOC);
    const { approveClaim } = await import('@/services/bn/postApprovalOrchestrator');

    await expect(approveClaim('claim-1', 'USER1')).rejects.toThrow();
    expect(checkApprovalPreconditions).toHaveBeenCalledWith(
      'claim-1', 'USER1', expect.objectContaining({ reasonCode: null }),
    );
  });
});
