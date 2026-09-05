# Compliance & Enforcement — Process Groups and Test/Fix Ownership Matrix

Purpose: split the Compliance module into functional process groups so each group can be
handed to **one owning team** for manual testing, defect fixing and delivery, with **no
overlapping ownership**. Groups that touch each other are listed as *supporting*
relationships — a supporting team helps, but never owns the fix.

Rule of engagement:
- **Owner** = raises, fixes, retests and signs off defects in that group.
- **Supports** = provides data/answers/joint reproduction only.
- A defect that crosses two groups is filed against the group that owns the **screen where
  the wrong result is displayed**, and reassigned only by the two owners agreeing in writing.

---

## G1 — Detection & Flagging (rule engine → violation raised)
Owns the answer to "did the system correctly detect a breach?"

| Process | Screens |
| --- | --- |
| Rule-based breach detection | Rule Engine, Rule Simulator |
| Scheduled detection jobs | Job Configuration, Employer Compliance Jobs, Job History |
| Rule-detected violation register | Rule Detected Violations |
| Manual violation raising | Manual Violation Entry |
| Duplicate/false-positive control | Duplicate Review, Verification Queue |
| Violation master data | Violation Types, Contribution Exemptions, Wage Benchmarks, Headcount Tiers |
| Violation lifecycle & history | Violations Management, Violation Details, Violation History |

Supports: G2 (case creation), G4 (amount owed), G8 (risk inputs).

## G2 — Case Management (violation → governed case)
| Process | Screens |
| --- | --- |
| Case intake & creation | Case Intake, Case Requests Queue |
| Case queues and assignment view | Case Queue, Assigned Cases, My Work Queue |
| Case working & 360 view | Case Detail View, Case Management |
| Merge / reopen governance | Case Merge Review, Reopen Requests |
| Case closure | Case Closure |
| Penalties on case | Penalty Management |
| Case taxonomy | Case Families |

Supports: G1, G3, G6, G7.

## G3 — Work Allocation & Supervision
| Process | Screens |
| --- | --- |
| Assignment queues & routing rules | Assignment Queues, Assignment Routing Rules |
| Reassignment / workload balancing | Reassignment |
| Supervisory review | Review Queue, Review Flag Queue, Completion Gate Settings |
| Officer & team structure | Officer Management, Queue Members, Supervisor Hierarchy, Legacy Inspector Linking |
| Geographic allocation | Zone Management, Office Zone Mapping, Village Zone Mapping |
| Workbench entry point | Workbench Landing |

Supports: every operational group (it only owns *who gets the work*, not the work itself).

## G4 — Financial: Ledger, Arrears, Interest & Allocation
| Process | Screens |
| --- | --- |
| Arrears and amount-owed computation | Arrears Reports, Employer Financial Ledger, Employer Financial Statement |
| Ledger posting & reconciliation | Ledger Posting Admin, Ledger Administration, Ledger Operations Dashboard, Ledger Help Center |
| C3 / payment synchronisation | C3 Ledger Sync, Payment Ledger Sync, C3 Compliance |
| Employer statements | Employer Statements, Employer Statement Detail, Payment History |
| Open financial decisions | Open Decision Register |

Supports: G5, G6, G9.

## G5 — Payment Arrangements & Breach Monitoring
| Process | Screens |
| --- | --- |
| Arrangement creation & approval | New Arrangement, Arrangement Pending Approval, Payment Arrangement Rules |
| Arrangement registers | All / Active / Arrangement List, Installments Due |
| Payment allocation to instalments | Payment Allocation |
| Arrangement breach detection | Breach Monitoring, Breaches |
| Partial payment requests | Partial Payment Requests |

Supports: G4 (balances), G6 (breach → notice), G7 (breach → escalation).

## G6 — Notices, Communication & Employer Response
| Process | Screens |
| --- | --- |
| Notice generation & approval | Generate Notice, Pending Approval, Notice Register |
| Delivery tracking | Delivery Tracking, Communication History |
| Employer online responses | Employer Responses, Online Response Config |
| Templates & trigger rules | Compliance Templates, Audit Communication Templates (+ Editor), Comm Trigger Rules, Field Stage Template Mapping |
| Numbering | Number Templates |

Supports: G2, G5, G7. Must never own template *content* decisions — those are business sign-off.

## G7 — Legal Escalation & Handover
| Process | Screens |
| --- | --- |
| Escalation policy & stages | Legal Escalation Policy, Escalation Stage Configuration |
| Recommendation & approval | Legal Recommendation Queue, Approved Escalations |
| Referral initiation | Referral Launcher, Referral Wizard, Compliance Legal Referrals |
| Pack preparation & submission | Legal Pack Preparation, Legal Queue |
| Returns and rework | Returned From Legal |
| Proceedings tracking | Legal Proceedings |
| Handoff rules | Legal Handoff Rules |
| Legal reporting/dashboard | Legal Dashboard, Legal Escalation Reports |

Supports: G2, G4.

## G8 — Risk Scoring, Sampling & Targeting
| Process | Screens |
| --- | --- |
| Risk model, factors, bands, policies | Risk Rule Policy (Model / Factors / Bands / Policies tabs), Risk Operations |
| Risk explainability & scores | Risk Score Details, Risk Simulator |
| Risk registers | High Risk Employers, Repeat Defaulters, Watchlist |
| Sampling & audit candidate selection | Sampling Dashboard, Monthly Audit Candidates, Employer Risk Profile, Risk Sampling Settings, My Upcoming Audits |

Supports: G9 (plan input), G1 (rule outcomes as factors).

## G9 — Inspections, Audit Planning & Field Execution
| Process | Screens |
| --- | --- |
| Weekly/inspector planning | Weekly Plan Builder (V2/V3/Smart), Inspector Plans, My Plans, Plan Execution Dashboard |
| Plan approval & revision | Planner Approval Inbox, Planner Approval Decide, Weekly Plan Review, Plan Revision Review, Revisions Pending |
| Audit management & visits | Audit Management, Audit Details, Audit Visit Workspace, Employer Visit Workspace, Audit Checklist |
| Field execution | Field Execution, Field Operations, Inspection Management |
| Evidence handling | Inspection Evidence, Evidence Upload / Edit / Preview |
| Finding → violation conversion | Convert Finding To Violation, Employer Findings |
| Weekly reporting | Weekly Reports, All Weekly Reports, Weekly Report Review / Submission, Pending Review |
| Audit report output | Audit Reports Register, Audit Report Print, Employer Audit Report Viewer |

Supports: G1 (findings become violations), G8 (outcomes feed risk).

## G10 — Waivers, Overrides & Concessions
| Process | Screens |
| --- | --- |
| Waiver requests & review | Waiver Requests Queue, New Waiver Request, Review Waiver |
| Waiver register & rules | Waiver Register, Waiver Rules, Waivers & Overrides |

Supports: G4 (financial effect), G2 (case effect).

## G11 — Employer Compliance Profile & Registry Linkage
| Process | Screens |
| --- | --- |
| Employer 360 & search | Employer 360, Employer 360 Search |
| Employer compliance management | Employer Compliance Management, Employer Status Register |
| Group/hierarchy handling | Employer Hierarchy |
| Unregistered employer leads | Unregistered Employer Leads |
| Self-employed compliance | Self-Employed Compliance |

Supports: all groups (it is the shared subject record).

## G12 — Reporting, Dashboards & Analytics
| Process | Screens |
| --- | --- |
| Operational dashboards | Compliance Dashboard, Command Center, Monitoring, Manager / Inspector Dashboards |
| Analytics | Compliance Analytics, Case Analytics, Trend Reports |
| Violation reports | Violations by Status / Type / Zone, Resolution Time |
| Performance & job reports | Inspector Performance, Automation Job Reports |
| Report catalogue & templates | Compliance Reports, Arrangement Reports, Audit Reports, Report Templates |

Owns only *presentation and reconciliation of numbers*. If a number is wrong because the
source lifecycle is wrong, the defect goes to the owning source group.

## G13 — Configuration, Access & Platform Hygiene
| Process | Screens |
| --- | --- |
| Module settings & setup | Compliance Settings, Setup Wizard |
| Feature toggles | Feature Toggles, Feature Toggle Diagnostics, Feature Disabled / Coming Soon / Route Gate |
| Workflow mapping | Workflow Mapping |
| Help content | Compliance Help Admin |

Supports: all groups. Owns access/permission defects, not business-rule defects.

---

## Ownership assignment sheet (fill before testing starts)

| Group | Owning team | Test lead | Fix lead | Sign-off | Supporting groups |
| --- | --- | --- | --- | --- | --- |
| G1 Detection & Flagging | | | | | G2, G4, G8 |
| G2 Case Management | | | | | G1, G3, G6, G7 |
| G3 Work Allocation | | | | | all |
| G4 Financial & Ledger | | | | | G5, G6, G9 |
| G5 Arrangements & Breach | | | | | G4, G6, G7 |
| G6 Notices & Communication | | | | | G2, G5, G7 |
| G7 Legal Escalation | | | | | G2, G4 |
| G8 Risk & Sampling | | | | | G1, G9 |
| G9 Inspections & Field | | | | | G1, G8 |
| G10 Waivers & Overrides | | | | | G2, G4 |
| G11 Employer Profile | | | | | all |
| G12 Reporting & Analytics | | | | | all sources |
| G13 Configuration & Access | | | | | all |

## Conflict rules
1. One group = one owner. No shared ownership of a group.
2. Cross-group defect: owned by the group whose screen shows the wrong outcome.
3. Configuration-caused defects (G13) are re-pointed to the business group that owns the rule.
4. A number that is wrong only on a dashboard (G12) is a G12 defect only if the source
   record is correct; otherwise it belongs to the source group.
5. Escalate ownership disputes to the Compliance module lead within one working day — never
   leave a defect unassigned.
