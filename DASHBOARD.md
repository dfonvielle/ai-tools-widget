# 📊 ai-tools-widget Dashboard

*Snapshot 2026-09-13 (fleet sweep: the stuck card law deploy) · previous: 2026-09-02 (the universal home breadcrumb deploy) — refresh by invoking `/dave-core:dashboard` in this repo.*

**Mission:** the public CDN for the Always Greater lesson chat widget — one stable URL every embed on every platform loads from, restyleable everywhere in one deploy.

## State board

| Lens | State | Where |
|---|---|---|
| Served widget (v1 URL, stable) | 🟢 live | `https://dfonvielle.github.io/ai-tools-widget/ai-tools-widget.v1.js` |
| Toolkit One Door page (`toolkit-home.js`, mounts the `tk_door` bot) | 🟢 live (deployed 2026-08-06) | [toolkit-home.js](toolkit-home.js) |
| Styling defaults (restyle every embed at once) | 🟢 live | [widget-defaults.json](widget-defaults.json) |
| Bot metadata (greet-from-static speed path, now incl. `tk_door`) | 🟢 live | [bots-meta.json](bots-meta.json) |
| Deploy cadence | 🟢 active (last: **2026-09-12 07:25** — the stuck card law: a failed AI turn in any of the 18 embeds now retries itself once, then shows one plain card with one **Try again** button, and never resets the chat; previous 2026-09-01 09:29, the universal breadcrumb) | git log |

## Progress

**Done:** GH Pages hosting · v1 alias scheme · defaults + bots-meta sidecars · mount/unmount API + first-message injection (built upstream, deployed here) · **2026-08-06: Toolkit One Door** — `toolkit-home.js`/`.v1.js` (the one-page/one-question router that hands the student's own words to the `tk_door` "Toolkit Guide" bot, which mounts exactly one tool below) + two `UNVERIFIED(gas-webapp)` markers (key-visibility, bounce-detection) dropped from this file in the same deploy — check the audit gauge for whether they were resolved upstream or just untracked here. · **2026-08-18: the One Door porch fixes** — the ask button reads **"Help me"** instead of "Find my tool", and a tool whose own greeting names a helper tool now shows a real door to it (`COMPANIONS`, first pair: the ASAP tool offers the Baggage Drop), carrying the student's own words across. Built in [ai_tools](https://github.com/dfonvielle/ai_tools) from Dave's 2026-08-18 porch walk, deployed here by `tools/deploy-widget.sh`. · **2026-08-19: two deploys out of the porch/teardown day** — 11:49 shipped the optional `data-crumb` breadcrumb on popup headers (an embed can print "Freedom Accelerator › tool" above the chat, additive: embeds without the attribute are byte-identical in behaviour), and 16:16 shipped `data-restart-message-from` (a start-over re-personalizes instead of replaying a cold greeting) plus `data-crumb-short` (the breadcrumb collapses to "FA" on phone widths). Both built in [ai_tools](https://github.com/dfonvielle/ai_tools) (`71449b9`, `9982724`) and deployed here by `tools/deploy-widget.sh`; +94/-6 and +44/-4 lines across the two served files. · **2026-09-01 09:29: the universal home breadcrumb** (`a96d03c`, +113/-21 across the two served files and `widget-defaults.json`) — the `data-crumb` header from 08-19 is now **ON by default**, resolved per embed as `data-crumb` attribute → `widget-defaults.json` `"crumb"` (fleet-wide, ships as `🏠`) → the built-in `HOME_CRUMB` so a `file://` test page still shows one. `data-crumb="off"` removes it from one embed, `"crumb": "off"` in defaults removes it everywhere, and a custom home-name still behaves exactly as it did. Built in [ai_tools](https://github.com/dfonvielle/ai_tools) from Dave's phone walkthrough and deployed here by `tools/deploy-widget.sh`. · **2026-09-12 07:25: the stuck card law** (`009ad3e`, +42/−3 in each served file) — Dave, on his phone, read *"try sending your message again"* with nothing to press. Now every failed AI turn in the old engine's 18 embeds ends the same way the new shell tools do: the first failure is re-sent once by itself (a small note says so), then ONE card says the answer did not come through and nothing typed is lost, with ONE **Try again** button that sends the same message down the same path; a third failure changes the words, never the shape. The session is never reset and the engine's own error sentence is never shown to a student. Built in [ai_tools](https://github.com/dfonvielle/ai_tools) (`8021909`, `davenode/shell/PROTOCOLS.md` § The stuck card) and deployed here by `tools/deploy-widget.sh`.

**Rule:** never edit here by hand — built in [ai_tools](https://github.com/dfonvielle/ai_tools) and shipped by `tools/deploy-widget.sh`.

## ✍️ Waiting on Dave

- Nothing. This repo is a deploy target.

## 🔌 Connections

| Surface | Detail |
|---|---|
| Producer | [ai_tools](https://github.com/dfonvielle/ai_tools) `tools/deploy-widget.sh` (the ONLY writer) |
| Hosting | GitHub Pages (public repo) |
| Embedded in | Systeme.io lessons (Freedom Tracker) + any future page |
| Google Apps Script | none (static hosting only) |

## 🤖 AI leverage

*Seeded from the 2026-07-19 fresh-eyes burn ([opus](https://github.com/dfonvielle/mission_control/blob/main/ai_research/fresh_eyes/ai-tools-widget_opus.md) · [gpt-4.1](https://github.com/dfonvielle/mission_control/blob/main/ai_research/fresh_eyes/ai-tools-widget_gpt41.md)).*

- **Session summarization:** end-of-chat 3-bullet takeaway the student can save — tangible artifact, higher perceived value.
- **Low-confidence escalation:** classify dead-end conversations and hand off to human coaching (upsell moment).
- **Affiliate-match scoring:** score which of Dave's tools genuinely fits the student's question — pay for AI only when there's monetization upside.

## 📚 Library

[README.md](README.md) · [CLAUDE.md](CLAUDE.md) (session contract, 2026-08-10) · upstream: [ai_tools HANDOFF](https://github.com/dfonvielle/ai_tools/blob/main/HANDOFF.md)

*🚀 Part of [Mission Control](https://github.com/dfonvielle/mission_control/blob/main/DASHBOARD.md) — the all-projects dashboard.*
