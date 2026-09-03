# IA Configuration Health Matrix — 2026-09-02

Design specification for `Internal Audit → Configuration Health`, an ADMIN
diagnostics surface. Server validation remains authoritative; this screen only
surfaces blockers early (section 37: fail at entry, not at report issuance).

## Check matrix

| # | Check | Severity | Current live result | Drill-down |
|---|---|---|---|---|
| 1 | Fiscal Year master configured and at least one year open for planning | CRITICAL | **FAIL — no master exists** | Fiscal Year Admin |
| 2 | Active auditable department without resolvable accountable head | CRITICAL | to evaluate after rule ships (Registration & Records fixed in Phase-E) | Department Master |
| 3 | Engagement referencing a non-existent department | CRITICAL | **1 record** (`6311e399-…`) | Engagement detail |
| 4 | Function without a valid parent department | CRITICAL | 0 | Function Master |
| 5 | Process without a parent function | WARNING | not yet evaluated | RCM |
| 6 | Unknown / inactive Audit Type on active work | CRITICAL | **36 rows unknown** | Audit Type reference |
| 7 | Unknown Coverage Category | WARNING | **67 rows unknown or polluted** | Coverage reference |
| 8 | Engagement with no coverage category | INFO | 36 rows | Engagement list |
| 9 | Engagement with no function | WARNING | 6 rows | Engagement list |
| 10 | Unmapped / inactive auditor holding active assignments | WARNING | to evaluate | Auditor Profiles |
| 11 | Missing QA reviewer configuration | WARNING | to evaluate | Audit Settings |
| 12 | Missing sender identity for IA communications | CRITICAL | resolved in Phase-E (`ia_department_sender`) | Omni-Comms |
| 13 | Missing communication recipient relationship | CRITICAL | resolved in Phase-E | Comms role designation |
| 14 | Invalid fiscal period / quarter inconsistent with planned dates | WARNING | derivation not yet implemented | Engagement |
| 15 | Risk model / thresholds unavailable | CRITICAL | present (`ia_risk_config_master`) | Risk Settings |
| 16 | Document / report template configuration missing | WARNING | to evaluate | Document Templates |
| 17 | Orphan reference of any class | CRITICAL | 1 | contextual |
| 18 | Inactive reference used by NEW work | WARNING | n/a until references exist | contextual |

## Presentation rules

- Three severities only: CRITICAL, WARNING, INFO. No `UNKNOWN` bucket — every
  check must return a determinate result or be omitted.
- Each row exposes the exact offending record ids and a corrective navigation link.
- Checks are read-only; the screen never repairs data.
- Historical records referencing later-deactivated masters must **not** raise a
  finding — only new-work eligibility is evaluated.

## Current headline (pre-remediation)

Critical: **5** · Warnings: **6** · Unknown: **0**
Active auditable departments without head: pending rule
Invalid current fiscal years: **18 (all — no master)**
Orphan active master relationships: **1**
