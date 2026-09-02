# Internal Audit — Phase E Final 20-Engagement Full-System E2E

Annual Plan: **IA-E2E-FINAL-2032** (`5dd6a953-663c-4e70-9c72-e3d72dd01571`), FY2032
Executed: 2026-09-02, TEST environment, controlled pilot (live dispatch governed)
Personas: HIA, Lead Auditor, Auditor 1, Auditor 2, QA Reviewer — all acting through
governed canonical RPCs only. No direct DML on Internal Audit business tables.

## 1. Verdict

**PASSED WITH ONE CONFIGURATION BLOCKER (19 of 20 engagements fully certified).**

| Measure | Result |
|---|---|
| Engagements closed end to end | 19 / 20 |
| Findings raised | 25 (21 Closed, 3 Withdrawn, 1 blocked — see OBS-E2E-C) |
| Management responses recorded and reviewed | 21 |
| Corrective actions tracked to Verified → Closed | 12 |
| Evidence artifacts registered | 12 |
| QA reviews cleared | 21 |
| Final reports issued (second-officer issuance) | 19 |
| Governed communication stages recorded | 120 |
| Omni-Comms messages delivered | 45 (16 email, 29 in-app) |

## 2. Lifecycle certified per engagement

Plan approval (SoD-enforced) → engagement prep and launch → notification and scope
communication → fieldwork → finding raise → Lead review → HIA confirmation →
release to management → management response → response review → corrective action
assignment → independent verification → action closure → follow-up outcome →
finding closure → draft-finding discussion → exit meeting → QA review cleared →
report draft and version → second-officer issuance → final report communication →
closure evaluation → engagement closure by HIA.

## 3. Segregation of duties — all controls fired

| Control | Attempt | Outcome |
|---|---|---|
| Plan approval | Lead approves own submitted plan | Refused |
| Finding confirmation | Author confirms own finding | Refused (`IA_SOD`) |
| Action verification | Management verifies own corrective action | Refused (`IA_SOD`) |
| Report issuance | Preparer issues own report | Refused (`IA_SOD_VIOLATION`) |
| Direct DML | Insert into `ia_audit_engagements` as authenticated | Refused (permission denied) |

## 4. Defects found and corrected during the run

### DEF-E2E-004 — `ia_record_communication_stage` overload ambiguity
An obsolete 9-argument overload made PostgREST return HTTP 300. The obsolete
overload was dropped; the canonical signature is now unambiguous.

### DEF-E2E-005 — `ia_findings.created_by` not stamped
Findings were inserted without authorship, silently disabling the "author cannot
confirm own finding" control. A `BEFORE INSERT` trigger now stamps `created_by`
and `created_date`. Retested: the author is now correctly refused.

### OBS-E2E-B — report issuance lacked preparer/issuer separation
The preparer could issue their own report. Issuance now requires a second
authorised officer, verified above.

## 5. Open items

### OBS-E2E-C — departments without a profile-linked head cannot communicate (BLOCKER for 1 engagement)
`FY2032 Data Quality & Deduplication Audit` (Registration & Records) could not
release its finding to management or issue its report:

- `IA_COMMS_RESPONSE_RECIPIENT_REQUIRED` on finding release
- `IA_COMMS_REPORT_RECIPIENT_REQUIRED` on report issuance

Root cause is estate configuration, not product logic: `ia_departments.head_profile_id`
is null for Registration & Records, Human Resources, Internal Audit and Office of
the Director, so no addressable recipient can be resolved. The control behaved
correctly by refusing to issue an audit report with no accountable recipient.
Remediation is administrative — provision the departmental head identity and link
it to the department, then rerun the release and issuance steps. Self-service
signup is disabled on this instance (correct posture), so a platform administrator
must provision the identity.

### DEF-E2E-003 — historical hygiene
Four `Planned` engagements remain attached to already-Closed historical plans from
prior years. No effect on the FY2032 run; scheduled for estate cleanup.

## 6. Communication safety under controlled pilot

Held (not sent) jobs during the run, all for governed reasons:

| Reason | Channel | Count |
|---|---|---|
| `release_limit_exceeded` | email | 9 |
| `release_snapshot_missing` | email | 2 |
| `recipient_not_allowlisted` | in_app | 2 |

No recipient outside the approved pilot allowlist was contacted. All 45 delivered
messages went to Internal Audit test mailboxes.
