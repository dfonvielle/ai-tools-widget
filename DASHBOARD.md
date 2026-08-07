# 📊 ai-tools-widget Dashboard

*Snapshot 2026-08-07 — refresh by invoking `/dave-core:dashboard` in this repo.*

**Mission:** the public CDN for the Always Greater lesson chat widget — one stable URL every embed on every platform loads from, restyleable everywhere in one deploy.

## State board

| Lens | State | Where |
|---|---|---|
| Served widget (v1 URL, stable) | 🟢 live | `https://dfonvielle.github.io/ai-tools-widget/ai-tools-widget.v1.js` |
| Toolkit One Door page (`toolkit-home.js`, mounts the `tk_door` bot) | 🟢 live (deployed 2026-08-06) | [toolkit-home.js](toolkit-home.js) |
| Styling defaults (restyle every embed at once) | 🟢 live | [widget-defaults.json](widget-defaults.json) |
| Bot metadata (greet-from-static speed path, now incl. `tk_door`) | 🟢 live | [bots-meta.json](bots-meta.json) |
| Deploy cadence | 🟢 active (last: 2026-08-06 21:54 — Toolkit One Door widget + defaults) | git log |

## Progress

**Done:** GH Pages hosting · v1 alias scheme · defaults + bots-meta sidecars · mount/unmount API + first-message injection (built upstream, deployed here) · **2026-08-06: Toolkit One Door** — `toolkit-home.js`/`.v1.js` (the one-page/one-question router that hands the student's own words to the `tk_door` "Toolkit Guide" bot, which mounts exactly one tool below) + two `UNVERIFIED(gas-webapp)` markers (key-visibility, bounce-detection) dropped from this file in the same deploy — check the audit gauge for whether they were resolved upstream or just untracked here.

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

[README.md](README.md) · upstream: [ai_tools HANDOFF](https://github.com/dfonvielle/ai_tools/blob/main/HANDOFF.md)

*🚀 Part of [Mission Control](https://github.com/dfonvielle/mission_control/blob/main/DASHBOARD.md) — the all-projects dashboard.*
