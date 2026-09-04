# Internal Audit — Formal Document Distribution Transaction Journal

Environment: TEST (`xynceskeiiisiefqlgxo`). HEAD at execution time: attachment correction wave.
Golden engagement: `badba0dc-8bc2-4254-9790-8a77da1ba279`
Issued report: `IA-RPT-SKN-2026-000038` (`336d509b-c065-40fe-abcc-9a577f5daec4`)

## Screen-driven transactions

| # | Screen | Action | Result |
|---|---|---|---|
| 1 | Report Builder → Preview | Opened the issued report | Preview shows ISSUED stamp; editing locked |
| 2 | Report Preview | Clicked **Distribute Report** | Distribution dialog opened; no seal existed yet |
| 3 | Distribution dialog | Entered recipient (Head of Internal Audit) and clicked **Distribute report** | Exact issued PDF rendered, uploaded, sealed as version 1 |
| 4 | Distribution dialog | Outcome panel | `accepted` for the recipient |
| 5 | Distribution dialog (re-open) | Sealed document panel | Version 1, SHA-256 `5c4b51a8…f781`, 30 KB, `IA-RPT-SKN-2026-000038-Issued.pdf` |

## Governed evidence (read-back)

Request `95c0bd4f-4509-4508-91c3-c4e1615edba5` — status `completed`:

| Channel | Message status | Attachment outcome | Reason |
|---|---|---|---|
| email | held (delivery gate) | `included` | – |
| in_app | held (delivery gate) | `dropped` | `channel_does_not_support_attachments` |

Both messages carry the pinned checksum `5c4b51a8…` and file name `IA-RPT-SKN-2026-000038-Issued.pdf`.
The in-app message was **not** blocked, which is the corrected behaviour.

## Negative cases proved

| Case | Method | Result |
|---|---|---|
| Mandatory document, scope `all_channels`, in-app | Rolled-back SQL against the live resolver | `blocked`, code `attachment_required_unsupported` (unchanged legacy behaviour) |
| Mandatory document, scope `attachment_capable_channels`, in-app | Rolled-back SQL against the live resolver | `dropped`, `ok = true` |
| Sealed artifact content mutation | Direct UPDATE of checksum | Rejected: `IA_ARTIFACT_SEALED` |
| Sealed artifact deletion | Direct DELETE | Rejected: `IA_ARTIFACT_SEALED` |
| Missing business fact (`engagementTitle`) | Live distribution attempt | `blocked` with bounded code `internal_audit_missing_fact:engagementTitle`; corrected and re-run |

## Regression — Annual Plan distribution

The plan artifact model, plan distribution service and its `requiredForDelivery` semantics are untouched:
the new scope column defaults to `all_channels`, so every pre-existing pinned attachment and every plan
distribution behaves exactly as before. Attachment fingerprinting was deliberately left unchanged so
idempotency keys of historical requests still replay.
