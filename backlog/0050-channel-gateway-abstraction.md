---
id: 50
title: "OpenClaw parity: unified inbound-channel / gateway abstraction"
status: icebox
priority: low
type: feature
source: planning
created: 2026-05-28
updated: 2026-05-28
refs: ["0048-external-gateway-exposure.md", "0049-telegram-full-surface.md", "0033-mcp-connect-verify.md"]
---

## Description
The end-goal shape for a full OpenClaw equivalent: web, Telegram, and future
channels (email / Slack / SMS / a hosted relay) as **pluggable inbound gateways**
that all share the one engine, capability model (#37), budget/ledger, and
approval flow — instead of each surface re-implementing routing + auth + delivery.

Deliberately iceboxed: only worth building once #48 (web external gateway) and
#49 (Telegram full surface) have landed AND a third channel is actually wanted.
Premature abstraction here would be exactly the kind of speculative framework to
avoid — capture the intent, don't build it yet.

## Acceptance criteria (when un-iceboxed)
- A `Channel`/`Gateway` interface: receive an inbound message (with a principal
  identity), dispatch through the shared engine, deliver the reply, and surface
  approval prompts — auth + capability gating handled once, centrally.
- Web (#27/#48) and Telegram (#49) refactored to implement it without behavior
  change (regression-tested).
- An ADR documenting the channel contract + a "how to add a channel" runbook.
- A third channel (e.g. email or a hosted relay) proves the abstraction earns
  its keep — do NOT land the interface without a second+third real implementor.

## Notes
This is the unifying layer behind "external gateways as well as telegram
connections." Keep it a design placeholder until the concrete surfaces exist.

## Reframe (2026-05-28) — narrowed to a single remote channel
Direction narrowed: **Telegram is the sole remote channel**; the web UI is
local-only (not a remote "channel"), and network exposure (#48) is iceboxed. With
no second/third inbound channel on the horizon, a unified channel-gateway
abstraction has nothing to abstract — stays iceboxed (effectively won't-do unless
a genuine third channel is later wanted).
