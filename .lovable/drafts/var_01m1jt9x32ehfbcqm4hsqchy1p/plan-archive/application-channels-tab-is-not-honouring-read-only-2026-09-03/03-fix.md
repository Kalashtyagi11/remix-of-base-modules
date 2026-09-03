## Proposed fix

Presentation-only change, one file: `src/components/bn/config/ChannelsTab.tsx`.

1. Pass `disabled={isReadOnly}` to the Channel Enabled switch, all 12 behaviour switches, the Screen Template / Workflow Template / Document Profile selects, and the Payment Details Visibility select — matching how the Communications tab already does it.
2. Keep the existing early-return guard in `save()` as the second line of defence.
3. Leave the read-only banner, layout, and all data/permission logic untouched.

No database, RPC, or permission changes. Result: on an ACTIVE (or any non-DRAFT) version, every control on the Application Channels tab is visibly locked, consistent with the other product tabs.
