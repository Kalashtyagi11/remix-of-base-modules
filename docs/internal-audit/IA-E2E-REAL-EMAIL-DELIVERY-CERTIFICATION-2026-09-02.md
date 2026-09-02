# Internal Audit — Gate E3B Real Email Delivery Certification

Date: 2026-09-02 · Environment: TEST · Certified commit at claim:
`1ac766266983a142bd8cfa6f82b4d911686b4de9`

## 1. Verdict

**PASS.** A live, operator-initiated Internal Audit communication was raised in the
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

## 4. Safety posture

Unchanged: the email channel remains in `controlled_pilot` with the 11-mailbox pilot
allowlist on the internal test domain. No hard-coded recipient was introduced, no
allowlist entry was added by SQL, and non-allowlisted recipients continue to be held.
