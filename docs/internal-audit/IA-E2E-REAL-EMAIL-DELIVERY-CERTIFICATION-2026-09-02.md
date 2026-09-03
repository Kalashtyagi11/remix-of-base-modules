# Internal Audit — Gate E3B Real Email Delivery Certification

Date: 2026-09-02 · Environment: TEST · Certified commit at claim:
`1ac766266983a142bd8cfa6f82b4d911686b4de9`

## 1. Verdict

**PROVIDER-ACCEPTED — MAILBOX RECEIPT PENDING (Gate E3B not yet PASS).**
Every technical boundary through the provider passed, but mailbox receipt at
`rohit@mishainfotech.com` cannot be observed from inside the platform and must be
confirmed by the recipient before Gate E3B is signed off. A live, operator-initiated Internal Audit communication was raised in the
UI, resolved by Omni-Comms, authorised by the controlled-pilot release control and
accepted by the email provider (HTTP 200 with a provider message id) for the safe
pilot mailbox `rohit@mishainfotech.com`.

## 2. Evidence

| Item | Value |
|---|---|
| Surface | Engagement → Preparation → Communications → Audit Intimation |
| Actor | Head of Internal Audit (`audit.hia@mishainfotech.com`) |
| Event | `INTERNAL_AUDIT.ENGAGEMENT.INTIMATION_ISSUED` |
| Request | `d888eb40-8870-404b-a317-68bd59e91452` (status `completed`) |
| Email message | `6f4638eb-5074-4eb9-b037-6cc2d88428f9` (status `delivered`) |
| Dispatch job | `b3ea1235-b1dd-4c72-a953-461836c68c97` (status `completed`, 1 attempt) |
| Release decision | `release_allowed`, `controlled_pilot`, release version 34, recipient rule matched |
| Provider outcome | `accepted`, status 200, provider message id `82ca919a-e5ee-4f8c-bbd2-32412db279bf`, latency 355 ms |
| Recipient (masked) | `r***@mishainfotech.com` |
| Rendered subject | `[Action required] Notice of internal audit — Gate E4.0B Canary Engagement` |
| In-app leg | Held (`recipient_not_allowlisted`) — correct governed behaviour |

No provider was contacted from the browser; the emission travelled the canonical
spine (façade → `omni-comms-runtime` → request/recipient/message → dispatch job →
scheduler dispatch).

## 3. Defects found and fixed

**DEF-E3B-001 — operator dialog supplied an incomplete fact set.**
`CommunicationStageDialog` passed only five values, so the producer's missing-fact
guard blocked every engagement-stage emission
(`auditeeUnit`, `scopeSummary`, `plannedStartDate`, `plannedEndDate`). The dialog now
supplies the full declared token vocabulary from the engagement context, with dates
formatted through the global display formatter. Recipient labels were also linked to
their inputs.

**DEF-E3B-002 — Internal Audit operator roles lacked runtime authorisation.**
`omni-comms-runtime` requires `omni_comms.operate` plus the caller-module permission
`internal_audit.view`. Neither was granted to the IA operator roles, so every
operator-initiated send returned `permission_denied`. `internal_audit.view` is now
granted to the four IA operator roles and `omni_comms.operate` to Head of Internal
Audit, Audit Admin and Lead Auditor only.

**DEF-E3B-003 — Head of Internal Audit identity had no staff assignment.**
Runtime organisation entitlement is proven from `core_staff_assignments`; the identity
had none and was refused with `organization_access_denied`. An active primary
assignment to the Internal Audit department was created.

## 4. Sender chain (verified live)

| Element | Value |
|---|---|
| Migration `20260901223413_5832c913-…` | applied in TEST |
| Repository HEAD | `6d92293fcd300f361fdbe23a666daad0128a2028` |
| Sender identity | `ia_department_sender` (`d988b7a9…`), active |
| From / reply-to | `SSB Internal Audit <internal.audit@secureserve.biz>` |
| Provider | `resend_email`, adapter key `resend` (NOT `simulation_email`) |
| Provider account | `omni_pilot_sandbox`, binding priority 1, status active (the `ref_sim_email` binding is retired) |
| INTERNAL_AUDIT enabled email routes | 88 canonical, 0 drifted |
| Template | family `0f7b3c3a…`, version `bb826927…`, layout `c0a9d637…` |
| Unresolved tokens | 0 |

## 5. Content inspection (rendered message)

Professional subject PASS · Internal Audit sender PASS · Professional HTML PASS ·
Responsive 600px table layout PASS · Salutation PASS · Purpose/context PASS ·
Reference PASS · Action required PASS · Deadline (planned start/end) PASS ·
Next steps PASS · Deep link PASS · Confidentiality footer PASS ·
Plain-text fallback PASS · Critical "Not stated" values: 0.

## 6. DEF-E3B-004 — compliance evidence could not distinguish real delivery

Internal Audit → Communication Compliance reads `ia_communication_stages`, and the
operator dialog recorded a stage row with `delivery_status = 'Sent'` but no link to
the Omni-Comms request, so a real provider send and a locally recorded stage looked
identical. `ia_record_communication_stage` now accepts and stores the event code,
Omni-Comms request id and occurrence; the dialog passes them; the report shows a
"Governed delivery" versus "Recorded only — no provider evidence" column and exports
both fields. The canary's existing stage row was backfilled with request
`d888eb40-8870-404b-a317-68bd59e91452`.

## 7. Hardcoded recipient scan

The Internal Audit path contains no hard-coded recipient — the address was operator
input only. The scan does find `rohit@mishainfotech.com` in the older
`communication-hub` pilot surfaces (`businessModuleCommunicationAdapter`,
`recipientControl`, `GovernedLivePilotPanelLegal`, `legalAssignmentWorkflow`,
`LgCaseDetail`). These predate Omni-Comms and are outside the IA scope, but they are
a live hard-coding finding to clear before production.

## 8. Safety posture

Unchanged: the email channel remains in `controlled_pilot` with the 11-mailbox pilot
allowlist on the internal test domain. No hard-coded recipient was introduced, no
allowlist entry was added by SQL, and non-allowlisted recipients continue to be held.
