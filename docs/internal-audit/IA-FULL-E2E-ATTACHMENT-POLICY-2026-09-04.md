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
