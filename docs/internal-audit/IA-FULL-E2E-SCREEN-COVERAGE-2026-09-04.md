# Internal Audit — Screen Coverage (Formal Document Distribution Wave)

| Screen | Route | Actions exercised | Verdict |
|---|---|---|---|
| Report Builder | `/audit/report-builder?id=…` | Opened issued report, locked editing, opened preview | PASS |
| Report Preview | Report Builder → Preview | Issued stamp, Print, Export PDF, Distribute Report | PASS |
| Distribute Official Audit Report dialog | Report Preview → Distribute Report | Sealed document panel, channel carriage policy, recipient entry, distribution, outcome panel | PASS |
| Report Center | `/audit/report-center` | Opened the existing issued report; no stray draft created | PASS |
| Engagement workspace (Timeline / Closure / Actions / Follow-Ups) | `/audit/audits/:id` | Verified unchanged post-closure behaviour | PASS |

Channels proved end to end for the issued report: **Email** (sealed document enclosed) and
**In-App** (notification delivered, document dropped by policy with a recorded reason).
