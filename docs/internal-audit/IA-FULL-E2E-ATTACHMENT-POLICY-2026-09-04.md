# Internal Audit — Formal Document Attachment Policy

Environment: TEST (`xynceskeiiisiefqlgxo`). No Production deployment.
Date: 2026-09-04

## 1. Ownership

| Concern | Owner | Notes |
|---|---|---|
| Business record identity (`IA-RPT-SKN-…`) | `ia_audit_reports` | Authoritative. PDF version is subordinate. |
| Formal document artifact (bytes, version, seal) | `ia_document_artifact` | New reusable register for all Internal Audit formal documents. |
| Governed attachment registry | `omni_comms_attachment` | Existing Hub registry. No duplicate created. |
| Per-request manifest (pinned bytes) | `omni_comms_request_attachment` | Pinned at request creation; replay-safe. |
| Per-message carriage outcome | `omni_comms_message_attachment` | Included / dropped / blocked, with reason. |
| Channel capability | `omni_comms_channel_attachment_policy` | Mirrored in `src/platform/omni-comms/attachments/attachmentPolicyMatrix.ts`. |

The Annual Plan artifact model (`ia_plan_artifacts`) is unchanged and keeps working exactly as before.

## 2. Channel carriage matrix

| Channel | Carries file | Max files | Max size | Carriage when a document is attached |
|---|---|---|---|---|
| Email | Yes | 10 | 20 MB | Exact sealed bytes enclosed |
| In-app | No | – | – | Secure in-platform link to the sealed document |
| SMS | No | – | – | Notification only |
| WhatsApp | No | – | – | Notification only |
| Push | No | – | – | Notification only |
| Print | No | – | – | Physical enclosure via the print pipeline |
| Voice | No | – | – | Not applicable |
| Webhook | No | – | – | Governed metadata + reference |

## 3. Requirement scope (defect correction)

Previously a mandatory attachment blocked **every** channel that could not carry a file, which made a
legitimate in-app notification undeliverable. A request attachment now declares a scope:

| Scope | Meaning |
|---|---|
| `all_channels` (default, unchanged behaviour) | Every requested channel must carry the file, otherwise the message is blocked. |
| `attachment_capable_channels` | Mandatory wherever files can be carried (Email). Channels that legitimately deliver a secure link are `dropped`, not `blocked`. |

Enforcement is server-side only, in `omni_comms_priv_resolve_message_attachments`.

## 4. Document lifecycle

```text
report issued
  → PDF rendered once (exact issued bytes)
  → uploaded to private bucket ia-artifacts
  → SHA-256 computed
  → ia_register_document_artifact(seal = true)   → Sealed, version N
  → omni_comms_register_attachment                → governed attachment id
  → emitInternalAuditCommunication(INTERNAL_AUDIT.REPORT.ISSUED, attachments = [id])
```

Sealed artifacts are immutable: content, path, size, file name, version and owner cannot change, and the
row cannot be deleted. A newer sealed version automatically supersedes the previous one. Re-distribution
reuses the existing seal — bytes are never re-rendered.

## 5. Classification

Final audit reports are registered as `confidential`. The storage bucket `ia-artifacts` is private and
readable only by authenticated users; `ia_document_artifact` rows are readable only by Internal Audit users
(`ia_is_ia_user()`), and rows can be created only through the governed RPC.

## 7. Convergence wave — defect IA-FULL-E2E-024 (generic stage communications)

Root cause: `CommunicationStageDialog` emitted stage communications with no governed attachment,
so Audit Intimation, Document Request, Draft Report circulation and similar formal stages sent an
email that referenced a document it never carried.

Correction (no second communication engine):

| Layer | Component |
|---|---|
| Central policy | `src/services/audit/auditCommunicationDocumentPolicy.ts` — event → document type, requirement (NONE/OPTIONAL/REQUIRED, configurable via `ia_audit_config`), source entity, sealed-artifact resolution, secure view link |
| Formal document production | `src/services/audit/auditStageDocumentService.ts` — branded PDF generated once, SHA-256, uploaded to `ia-artifacts`, sealed via `ia_register_document_artifact`, registered via `omni_comms_register_attachment`. Existing sealed bytes are reused, never re-rendered |
| Screen | `FormalDocumentPanel` inside the stage dialog: document name, reference, version, lifecycle, size, classification, Required/Optional, View PDF, Generate Document when absent. Required + missing blocks Distribute |
| Carriage | Attachment passed as `requiredForDelivery: true`, `requirementScope: attachment_capable_channels` — Email encloses bytes, In-App keeps a secure link and is never blocked |
| History | `DistributionHistoryPanel` (RPC `ia_document_distribution_history`) in the engagement Preparation workspace: who / what artifact + version + checksum / when / channel / delivery result |
| Vocabulary | Send / Resend / Reminder replaced by Distribute / Redistribute / Distribute Reminder |

Browser proof (TEST, engagement `IA-ENG-SKN-2026-000093`):

| Item | Result |
|---|---|
| Dialog resolves policy | Audit Intimation shown as REQUIRED, Distribute disabled while absent |
| Generate Document | Sealed v1 `audit_intimation_letter-GOLDEN-Benefits-Claims-Processing-Audi.pdf`, 6.3 KB, Internal |
| Reopen dialog | "Sealed bytes reused" — no regeneration |
| Distribute | `omni_comms_request` completed, request attachment pinned `bc83669a0b9056e510efa4a45878296c733cb29d199d369ed8fa2f04bb3263b7`, 6483 bytes, `attachment_capable_channels` |
| Prior sealed report regression | `IA-RPT-SKN-2026-000038-Issued.pdf` checksum `5c4b51a8…` unchanged |
| Business user needs manual Outlook/Gmail send | NO |
| Backend workarounds | 0 |

Provider mailbox observation was not performed in this wave; TEST release gates still hold dispatch,
so provider delivery is classified as **not directly observed**.
