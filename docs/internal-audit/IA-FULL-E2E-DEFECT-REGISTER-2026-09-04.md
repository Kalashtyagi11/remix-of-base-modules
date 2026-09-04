# Internal Audit — Defect Register (Formal Document Distribution Wave)

| ID | Severity | Description | Root cause | Correction | Status |
|---|---|---|---|---|---|
| IA-FULL-E2E-017 | High | Report Center could create a stray draft report for a closed engagement | Auto-create ran before the reports query resolved | Wait for query completion; prefer the issued report; never auto-create for Closed/Cancelled | Closed |
| IA-FULL-E2E-018 | High | No reusable formal document model — issued report PDFs existed only as ad-hoc downloads | Only the Annual Plan had an artifact register | New governed `ia_document_artifact` register with versioning, checksum, sealing and immutability | Closed |
| IA-FULL-E2E-019 | High | A mandatory attachment blocked channels that cannot carry files, making valid in-app notifications undeliverable | Requirement was channel-blind | Added `requirement_scope`; server resolver now blocks only where carriage is possible | Closed |
| IA-FULL-E2E-020 | Medium | The issued report could not be distributed from the screens; PDF bytes were only downloadable | No distribution surface for reports | **Distribute Report** action + governed distribution dialog and service | Closed |
| IA-FULL-E2E-021 | Medium | Report preview lacked the report identity (id / number / issued date) | Builder passed only form state | Identity now passed to the preview | Closed |
| IA-FULL-E2E-022 | Low | Distribution blocked on a missing `engagementTitle` fact | Engagement name column is `engagement_name` | Fact resolution corrected | Closed |

Business backend workarounds used: **0**. Every business action was performed through the visible screens.
