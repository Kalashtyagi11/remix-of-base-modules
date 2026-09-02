# Internal Audit — Phase E, Final 20-Engagement Full-System E2E
## Section 2/3 Baseline Record and Pre-Execution Readiness

Status: **BASELINE RECORDED — EXECUTION NOT YET STARTED**
Recorded: 2026-09-02 (UTC)
Environment: TEST / PREVIEW (`platform_environment_marker` = TEST,
`Internal Audit Certification / Lovable Cloud Test`, controlled test
activation allowed).

---

## 1. Heads and revisions

| Item | Value |
|---|---|
| Accepted starting baseline (as authorized) | `6d92293fcd300f361fdbe23a666daad0128a2028` |
| **ACTUAL CURRENT HEAD (rebased to)** | `55037fbd83111870007b4452cfbfa4168f44a7c4` |
| Omni certified revision (`omni_comms_dispatch_activation.certified_revision`) | `1ac766266983a142bd8cfa6f82b4d911686b4de9` |
| Certified from | 2026-09-01 22:08:57Z |
| Environment kind / project ref | TEST / `xynceskeiiisiefqlgxo` |

**Finding OBS-E2E-A — certification lag.** The certified dispatch revision
(`1ac76626…`) is behind the current HEAD (`55037fbd…`). Per DEF-E2E-002, the
dispatcher compares the observed runtime revision against
`omni_comms_dispatch_activation.certified_revision`; any deployment of the
current HEAD before re-certification will hold every rendered job with
`certification_revision_mismatch`. A governed `certify_deployment` run through
`omni-comms-release-control` is a prerequisite for the E2E communication legs.

---

## 2. Historical estate verification (section 2 of the brief)

Expected per the authorized preconditions: 14 Annual Plans, 14/14 Closed,
0 active non-terminal historical engagements.

Actual, read live from `ia_annual_plans` / `ia_audit_engagements`:

| Measure | Expected | Actual |
|---|---|---|
| Annual Plans (all rows) | 14 | **17** |
| Closed Annual Plans | 14 | **14** |
| Non-closed Annual Plans | 0 | **3** |
| Non-terminal (`Planned`) engagements on **Closed** plans | 0 | **4** |
| Non-terminal engagements on non-closed plans | — | 2 |

### The three non-closed plans

| Fiscal year | Title | Status |
|---|---|---|
| `2027-CANARY` | Gate E4.0 Communication Canary Plan | Approved |
| `2028-CANARY-B` | Gate E4.0B Post-Certification Communication Canary | Draft |
| `2029-CANARY-C` | Gate E4.0B Post-Certification Communication Canary | Approved |

These are the three communication-canary plans created during Gates E4.0 /
E4.0B. They are **not** part of the 14 certified business Annual Plans, so the
"14/14 Closed" business precondition holds exactly. They are, however, real
open Annual Plans in the estate and must be disposed of under section 34
("No unexplained open Annual Plan").

### The four `Planned` engagements on Closed plans

Distribution: `2026-2027` ×1, `2029` ×1, `2031` ×1, plus one further row (see
matrix). Each sits on a plan already in `Closed` status.

**Recorded as DEF-E2E-003 (Medium, historical integrity / closure accuracy) —
not remediated.** Plan closure recorded a terminal plan state while leaving
non-terminal child engagements, which contradicts section 34 and the
"closure summary matches exact engagement dispositions" requirement of
section 33. Evidence: `ia_annual_plans.status = 'Closed'` joined to
`ia_audit_engagements.status = 'Planned'`. No historical record has been
altered.

---

## 3. Controlled-pilot capacity assessment (section 3)

Live `omni_comms_channel_release_control`:

| Channel | Release state | Version | Max recipients/request | Per hour | Per day | Total | Window |
|---|---|---|---|---|---|---|---|
| email | controlled_pilot | 34 | 10 | **20** | **100** | **500** | 2026-09-01 21:53Z → 2026-09-08 20:58Z |
| in_app | controlled_pilot | 14 | 10 | **20** | **100** | **500** | 2026-09-01 21:41Z → 2026-09-08 20:46Z |
| print | suspended | 2 | 10 | 20 | 100 | 500 | — |

Consumption to date (`omni_comms_message`):

| Channel | delivered | held | blocked | cancelled | other |
|---|---|---|---|---|---|
| email | 49 | 0 | 4 | 67 | 1 dry-run |
| in_app | 46 | **55** | 0 | 2 | — |
| print | — | — | — | — | 8 accepted |

### Projected E2E volume

20 engagements. Deep journeys (10) carry roughly 12–18 governed
communications each (intimation, entrance meeting, document request,
reminder, query, finding release, management response, corrective action
assignment, extension decision, verification outcome, follow-up, QA, report
issue, closure). The remaining 10 carry 3–6 each.

Projected: **~180–240 email obligations and a similar in-app volume**,
concentrated into a short execution window.

### Verdict

Current caps are **insufficient** on two axes:

- `max_messages_per_hour = 20` — the E2E will exceed this within the first
  two engagements of a batch.
- `max_messages_per_day = 100` — exceeded by the full run.
- `max_messages_total = 500` is adequate for email (121 consumed) but leaves
  little headroom if reminders fire.

Required, through the **governed maker/checker release-control workflow only**
(`omni-comms-release-control`, propose → approve → activate), retaining
`controlled_pilot` and the existing safe-recipient allowlist, bounded to the
E2E window:

| Channel | Field | From | To (proposed, temporary) |
|---|---|---|---|
| email | max_messages_per_hour | 20 | 120 |
| email | max_messages_per_day | 100 | 600 |
| email | max_messages_total | 500 | 1500 |
| in_app | max_messages_per_hour | 20 | 120 |
| in_app | max_messages_per_day | 100 | 600 |
| in_app | max_messages_total | 500 | 1500 |

Release state, recipient allowlist, permitted event codes and expiry are
**unchanged**. No unlimited or production-style release is proposed.

**Also required before the communication legs:** the 55 `held` in_app messages
must be re-evaluated (`omni_comms_priv_reevaluate_held_jobs`) or retired
through the governed `retire_held_job` action so that E2E in-app evidence is
not confounded with pre-existing backlog.

---

## 4. Execution-harness constraint

The sandbox database role (`sandbox_exec`) cannot read the `auth` schema and
cannot `SET ROLE authenticated`, so governed Internal Audit commands **cannot**
be executed with persona identity from SQL. Executing this certification as
real personas (Head of Internal Audit, Lead Auditor, Team Members, Quality
Reviewer, Benefits/Compliance/Finance Management, Audit Admin) requires one
minted authenticated session per persona, driven through PostgREST / the UI.

Available TEST personas with linked `auth` identities (`ia_auditors.user_id`):

| Role | Name | Email |
|---|---|---|
| Head of Internal Audit | Head of Internal Audit | audit.hia@mishainfotech.com |
| Lead Auditor | Lead Auditor | audit.lead@mishainfotech.com |
| Auditor | Audit Team Member One | audit.auditor1@mishainfotech.com |
| Auditor | Audit Team Member Two | audit.auditor2@mishainfotech.com |
| Quality Reviewer | Quality Reviewer | audit.qa@mishainfotech.com |
| Head of Internal Audit (W4) | W4 Cert Head of Internal Audit | w4-cert-hia@certification.invalid |
| Lead Auditor (W4) | W4 Cert Lead Auditor | w4-cert-lead@certification.invalid |
| Quality Reviewer (W4) | W4 Cert Quality Reviewer | w4-cert-qa@certification.invalid |

The `@certification.invalid` identities are usable for governance/SoD proofs
but must never be used where a real email is dispatched.

---

## 5. Gate status before execution

| Prerequisite | State |
|---|---|
| Rebase to actual HEAD | DONE (`55037fbd…`) |
| Environment recorded | DONE (TEST) |
| Historical estate verified | DONE — 14/14 business plans Closed; 3 canary plans open; 4 non-terminal engagements on closed plans (DEF-E2E-003) |
| Deployment re-certification of current HEAD | **OUTSTANDING** (OBS-E2E-A) |
| Controlled-pilot capacity uplift (governed) | **OUTSTANDING** |
| In-app held backlog cleared | **OUTSTANDING** (55 messages) |
| Persona sessions minted | **OUTSTANDING** |

Execution of sections 4–35 has **not** started. No E2E Annual Plan has been
created; no engagement, finding, action, document or communication has been
raised.
