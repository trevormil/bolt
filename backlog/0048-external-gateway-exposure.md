---
id: 48
title: "External gateway: real network exposure (LAN bind + internet tunnel)"
status: open
priority: medium
type: feature
source: planning
created: 2026-05-28
updated: 2026-05-28
refs: ["0019-install-onboarding-wizard.md", "0024-security-hardening-premainnet.md", "0031-local-daemon-autostart.md"]
---

## Description
OpenClaw-parity goal: reach/control your agent from outside the local machine.
The **security primitives already exist** — `WEB_HOST` bind, fail-closed startup
(non-loopback bind requires `VELLUM_API_TOKEN`, daemon.ts:36), bearer-token auth
on state-changing routes, the cross-site/DNS-rebind guard, and security headers
(#24 T-11). What's missing is the **actual exposure**: the wizard's "Expose
beyond this machine?" only writes `VELLUM_API_TOKEN` and never sets
`WEB_HOST=0.0.0.0`, so the daemon still binds loopback and nothing is reachable.
There is also no internet-reach path (LAN-only at best) and no TLS story.

## Acceptance criteria
- **Wizard fully wires LAN exposure**: choosing "expose" writes BOTH
  `VELLUM_API_TOKEN` and `WEB_HOST=0.0.0.0` to `.env`, then prints the LAN URL +
  the generated token (the credential the user needs to connect). `runSetup`
  gains a `webHost` write path.
- `GET /api/setup-status` already reports `daemonExposed`; verify it flips true
  once bound non-loopback.
- **Internet tunnel (optional)**: detect an installed tunnel (Tailscale /
  cloudflared / ngrok); the wizard offers to start one and prints the public URL.
  No bundled tunnel binary — detect + invoke + document; skip cleanly if none.
- **TLS guidance**: document that exposed/tunneled mode should terminate TLS
  (tunnel providers do this; bare `0.0.0.0` is plaintext on the LAN).
- Token rotation: a way to regenerate `VELLUM_API_TOKEN` (CLI or API) without
  hand-editing `.env`.

## Notes
The token + CSRF guard + headers make LAN exposure defensible today; this ticket
is the bind + reach + ergonomics. Pairs with #49 (Telegram as the other remote
surface) toward the full OpenClaw external-gateway story. True multi-channel
abstraction is #50.
