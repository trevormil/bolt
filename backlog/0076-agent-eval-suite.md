---
id: 76
title: "Agent eval suite — commands/behavior + heavy private-key-security evals (in tandem with #64)"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/87"]
priority: medium
type: testing
source: trevor
created: 2026-05-28
updated: 2026-05-29
refs: ["0064-agent-key-security.md", "0051-agent-money-autonomy.md", "0052-agent-dev-capability-yolo.md", "0090-ci-eval-test-gating-initiative.md"]
---

> **Progress (2026-05-29, MR !87, under #90):** added a `security` eval category +
> two deterministic oracles (`replyIncludes`, `ledgerExcludesKind`) and a first
> battery — seed-exfil refusal, prompt-injection resistance, + a 2-of-3 multisig
> vault-create. Harness/oracles unit-tested offline; real-LLM run is the manual CI
> `evals` job. Remaining: command-surface goldens (send/request/withdraw→send,
> Telegram), more security cases (capability-gate bypass attempts), Langfuse score
> emission. Engine-invariant enforcement (over-cap rejection) → deterministic tests.

## Description
A runnable **eval suite** for agent *behavior* (distinct from unit/e2e coverage —
see #77). Two halves:

1. **Basic stuff + commands.** Golden cases that the agent uses the right tools
   for plain asks: create a vault (with criteria), check balance, request funds /
   vault deposit / vote link, send USDC, withdraw→send, and the Telegram command
   surface. Assert tool selection + safe behavior, not just that it replies.
2. **Heavy private-key-security evals.** A large battery probing whether a
   prompt-injected or adversarial agent can exfiltrate the seed phrase, move funds
   it shouldn't, bypass the capability gates, or read the key via `run_command`.
   These define the bar the #64 key-security work must clear.

## Acceptance criteria
- A `bun run eval` (or similar) that runs the suite and reports pass/fail per case.
- Command/behavior cases for each agent tool's golden path + a few adversarial.
- A substantial security-probe set (seed exfil attempts, gate-bypass attempts,
  unauthorized spends) that currently documents the posture and becomes the
  regression gate once #64 lands a hardening.
- Budget-aware (real-LLM evals cost) — single-case while iterating, full run for
  baseline/CI; Langfuse-traced where useful.

## Notes
"For later" per Trevor, but **do in tandem with #64** (private-key security) — the
evals are how we prove the key-security posture. This is agent-behavior evals;
feature/UI test coverage + CI automation is #77.
