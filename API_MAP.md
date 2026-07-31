# API_MAP — ai-tools-widget

Written by the fleet defect audit's tail sweep (PLAN_fleet_defect_audit Phase 4, 2026-07-31).
**Marker sweep only — NOT deep-audited.** Rank 12 on `mission_control/AUDIT_MAP.md`.
Markers are in `ai-tools-widget.js` (the published copy). `ai-tools-widget.v1.js` and
`ai_tools/widget/ai-tools-widget.v1.js` are frozen copies carrying the same beliefs.

| # | Marker | Where | The belief | Probe that flips it to PROVEN/DENIED |
|---|--------|-------|-----------|--------------------------------------|
| 1 | `UNVERIFIED(gas-webapp)` | `ai-tools-widget.js` → `bounced` | a reply shaped `{ok:true, service:'ai_tools'}` is always a transport bounce, never a real answer | Have the engine stamp a nonce from the request into every reply and test on that instead of on the service name. Today a genuine engine reply of that shape is discarded three times and the visitor sees a generic failure, with nothing logged. |
| 2 | `UNVERIFIED(gas-webapp)` | `ai-tools-widget.js` → `bootWith` | the engine's Gate is a sufficient fence for a key published in page source | Replay a captured `data-key` from curl and confirm the Gate's rate limit and per-key quota refuse it. The key is public by design; this file assumes the fence exists and holds, and would not notice abuse. |
