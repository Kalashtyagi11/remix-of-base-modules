# Application Channels tab is not honouring read-only

No — it is not correct. It is a UI defect in the Application Channels tab only.

On the Product editor, a version is editable only when its status is `DRAFT`. Every tab receives the same read-only flag, and the Application Channels tab shows the read-only banner correctly. But inside that tab only the free-text fields (Workflow Definition ID, Default Source, Correction Deadline) are actually disabled. All the switches and dropdowns stay interactive:

- Channel Enabled switch
- Screen Template, Workflow Template, Document Profile dropdowns
- All 12 behaviour switches (Allow Save Draft, OTP, blocking rules, payment gates, etc.)
- Payment Details Visibility dropdown

Nothing is actually written to the database — the save handler returns early when the version is read-only — so an ACTIVE product cannot be silently modified. The problem is purely that the controls look editable, flip visually, and then silently do nothing with no explanation. By comparison the Communications tab disables every control correctly, which is the pattern to follow.
