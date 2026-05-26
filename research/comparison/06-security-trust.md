---
title: "Security & Trust — OpenClaw vs Hermes vs Vellum"
dimension: security-trust
date: 2026-05-26
status: comparison
note: >
  Point-in-time analysis (late May 2026). CVE records, exploit counts, and
  deployment statistics evolve continuously; verify against NVD and vendor
  advisories before acting on any figure here. No product decision is made or
  implied by this document.
---

# Security & Trust

Security is the clearest differentiation axis in the personal-assistant market
right now. OpenClaw's explosive growth outpaced its security review bandwidth
and produced a documented public crisis. Hermes designed proactively but
carries real architectural exposure. Vellum built trust as its primary
marketing claim and its deepest engineering layer — but has never faced
adversarial production traffic at scale. Each product's security story is
inseparable from its maturity and deployment model.

---

## At a glance

| Dimension | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| **Trust / autonomy model** | Full autonomy by default; tool-policy precedence cascade; "deny wins at every level" in policy — but default posture is permissive | Seven documented security layers; role-based leaf/orchestrator split; YOLO mode opt-in but present | Fail-closed by design; progressive trust ("ask for approval until you grant more freedom"); guardian / trusted / unknown actor classification |
| **Permission enforcement** | Tool Profile → Provider → Global → Provider → Agent → Group → Sandbox cascade; each level only restricts, never re-grants | Dangerous-command approval per call; hardline blocklist that YOLO cannot bypass; container backends replace approval with OS isolation | Trust Rules in SQLite with glob patterns; four risk tiers (none/low/medium/high); skill version-hash binding; deny beats ask beats allow at equal priority |
| **Sandboxing** | Docker per DM/group session; read-only rootfs + dropped caps configurable; main sessions run natively | Seven backends (local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox); Docker enforces cap-drop ALL + no-new-privileges + process limits; container backends skip approval and use OS boundary instead | Native OS sandboxing: `sandbox-exec`/SBPL on macOS, `bwrap` on Linux; workspace vs. host tool split; fail-closed: commands fail if sandbox backend is unavailable |
| **Prompt-injection defense** | ~17% native defense rate in independent testing (attack success 64-83%); GitHub issue #62939 tracking tool-boundary injection; structural defenses (privilege separation) reduce rates but not documented as enforced defaults | Context-file pre-inclusion scanning (AGENTS.md, .cursorrules, SOUL.md) for override instructions, hidden HTML, invisible Unicode; Tirith integration; SSRF blocklist; but SQLite memory store is persistent injection surface | Inbound messages scanned for secrets (regex + entropy); actor identity resolved once and enforced everywhere; unknown actors cannot read memory or trigger tools; skill version-hash re-prompts on any file change |
| **CVE track record** | 138 advisories in 63 days (Feb–Apr 2026); 7 Critical (CVSS 9.0+); 49 High; two significant exploit clusters: ClawBleed (CVSS 8.8) + March 9-CVE cluster (peak CVSS 9.9) + Claw Chain (four chained, peak CVSS 9.6); active exploitation confirmed | Two disclosed CVEs: CVE-2026-22798 (CVSS 5.0–5.9, credential logging, fixed v0.9.1) and CVE-2026-7396 (CVSS 5.3, path traversal in WeChat adapter, version 0.8.0). No critical-severity CVEs. No active exploitation confirmed. | No CVEs disclosed as of May 2026. Product launched May 7, 2026 — too new for a meaningful track record in either direction. |
| **Supply-chain risk** | ClawHavoc: 1,184 malicious skills across 12 publisher accounts; 91% included embedded prompt injection; Cisco released DefenseClaw in response; 17% of all ClawHub skills flagged by Cisco researchers | agentskills.io marketplace with 672+ skills; community scanner at submission; no confirmed malicious-skill incident as of May 2026; same theoretical risk as ClawHub (install-time code execution) | 60+ built-in skills, no public marketplace yet; no third-party supply-chain exposure documented; skill version-hash binding prevents silent skill mutation |
| **Credential handling** | `~/.openclaw/credentials/` at file perm 0600; auto-excluded from VCS; credentials not passed to model in documentation; but CVE-2026-44115 (CVSS 8.8) demonstrated env-var credential exposure via heredoc expansion bypass | MCP environment filtering whitelists only PATH/HOME/USER/LANG/TERM/SHELL/TMPDIR/XDG_*; error message redaction for GitHub PATs, OpenAI keys, bearer tokens; CVE-2026-22798 showed credential logging in plaintext (fixed v0.9.1) | Keychain-backed vault (macOS Keychain, encrypted file fallback on Linux); Credential Execution Service (CES) runs as isolated separate process; LLM never sees raw tokens; credentials injected at network layer by proxy; encryption key held by CES only |

---

## OpenClaw

### Trust and autonomy model

OpenClaw's core posture is **full autonomy by default** — the agent acts
immediately unless constrained. The tool-policy system enforces a precedence
cascade from broadest to narrowest:

```
Tool Profile → Provider Profile → Global Policy → Provider Policy
  → Agent Policy → Group Policy → Sandbox Policy
```

Each level can only further restrict, never re-grant. "Deny wins at every level"
is the documented rule within the cascade. In practice, the default configuration
exposes full host access to main-session agents; sandboxing is opt-in and applies
to DM/group sessions by default, not all sessions. The approval model for
dangerous commands is not enforced by default in the same way Vellum and Hermes
enforce it.

### Sandboxing

Docker-based isolation is available per session and configurable per agent:
`sandbox.mode` (off/non-main/all) and `sandbox.scope` (session/agent/shared).
The recommended hardened configuration uses `network: "none"`, `capabilities.drop: ["ALL"]`,
`readOnlyRootfs: true`, and resource limits. However, these are *documented
best practices*, not enforced defaults. Main sessions run natively with host
access unless the operator explicitly enables all-session sandboxing.

The sandbox was the primary attack surface in the Claw Chain disclosures: the
OpenShell managed sandbox backend contained TOCTOU race conditions (CVE-2026-44112,
CVE-2026-44113) that enabled read/write escapes even when sandboxing was
properly configured.

### Prompt-injection defense

Independent testing (reported by Data Science Collective, citing research
through late Q1 2026) found a ~17% native defense rate against adversarial
prompt injection — meaning approximately 83% of attacks succeed without
additional hardening. Structured defenses (privilege separation, input
boundaries) do reduce rates: research at arxiv.org/pdf/2603.13424 documents
structural approaches reducing attack success from 73.2% to 8.7%, but these
are not enforced defaults in the base install.

OpenClaw GitHub issue #62939 tracks tool-result and message-boundary injection
as an open feature request, indicating the defense is not yet implemented
in the core. The ClawHavoc campaign demonstrated that 91% of malicious ClawHub
skills embedded prompt injection alongside their exfiltration payloads — the
attack surface is real and actively exploited.

### CVE track record

This is OpenClaw's most significant security liability. The timeline:

**CVE-2026-25253 (ClawBleed) — CVSS 8.8 (High)**
Disclosed February 3, 2026. Cross-site WebSocket hijacking (CWE-669): the
local WebSocket server did not validate the Origin header. An attacker could
craft a malicious link causing the victim's browser to connect to an
attacker-controlled WebSocket endpoint, automatically sending the stored
auth token. One-click RCE with no authentication required. Patched in
v2026.1.29. By disclosure, 135,000+ instances were internet-exposed; 15,000
specifically vulnerable to RCE; 53,000 correlated with prior breach activity
(SecurityScorecard STRIKE team).

**March 2026 nine-CVE cluster (March 18–21, 2026)**

| CVE | CVSS | Type |
|---|---|---|
| CVE-2026-22171 | 8.2 (High) | Path traversal, media download |
| CVE-2026-28460 | 5.9 (Medium) | Allowlist bypass via shell characters |
| CVE-2026-29607 | 6.4 (Medium) | Approval wrapper bypass ("allow always" persists at wrapper, enables payload swap without re-prompt) |
| CVE-2026-32032 | 7.0 (High) | Untrusted shell environment variable |
| CVE-2026-32025 | 7.5 (High) | WebSocket brute-force, no rate limiting |
| CVE-2026-22172 | **9.9 (Critical)** | WebSocket scope self-declaration: client declares its own scopes during handshake, enabling `operator.admin` escalation |
| CVE-2026-32048 | 7.5 (High) | Sandbox escape via child process |
| CVE-2026-32049 | 7.5 (High) | Oversized media payload DoS |
| CVE-2026-32051 | 8.8 (High) | Privilege escalation in scopes |

CVE-2026-22172 (CVSS 9.9) is the worst single vulnerability in OpenClaw's
history. The server accepted client-declared authorization scopes at WebSocket
handshake without server-side validation.

**Claw Chain — April/May 2026 (patched v2026.4.22)**

Four chainable vulnerabilities discovered by Cyera Research (researcher
Vladimir Tokarev) and named "Claw Chain":

| CVE | CVSS | Type |
|---|---|---|
| CVE-2026-44112 | 9.6 (Critical) | TOCTOU write escape — redirects writes outside sandbox mount root; enables backdoor installation |
| CVE-2026-44115 | 8.8 (High) | Heredoc shell expansion bypass — env-vars including API keys exposed via unquoted heredocs |
| CVE-2026-44118 | 7.8 (High) | `senderIsOwner` flag not validated against session — non-owner gains owner-level tools |
| CVE-2026-44113 | 7.7 (High) | TOCTOU read escape — symlink race allows reading credentials outside sandbox |

The four-step exploit chain: (1) initial access via malicious plugin or prompt
injection into sandbox; (2) CVE-2026-44113 + CVE-2026-44115 to extract
credentials; (3) CVE-2026-44118 to escalate to owner-level control; (4)
CVE-2026-44112 to establish persistence. At disclosure, ~65,000 public-facing
instances were identified via Shodan; ~180,000 via Zoomeye.

**Aggregate track record (as of May 2026):**
138 advisories in 63 days (Feb–Apr 2026). 7 Critical (CVSS 9.0+). 49 High
(CVSS 7.0–8.9). Approximately 2.2 new advisories per day over that window.
The Register's characterization: "Whac-A-Mole." Two separate exploit clusters
with in-the-wild confirmed exploitation.

### Supply-chain risk

ClawHub (44,000+ skills) suffered the ClawHavoc campaign: 1,184 malicious
skills published across 12 accounts, with one publisher responsible for 677
packages alone. 91% of malicious skills embedded prompt injection alongside
exfiltration payloads. Cisco researchers flagged approximately 17% of all
ClawHub skills as potentially malicious. Cisco released DefenseClaw (open
source, March 27) as a mitigation tool.

The supply-chain risk is structural: skills are Markdown files with natural-
language instructions that direct agent behavior. A malicious skill does not
require code execution at install time — the attack surface is the prompt,
not the package manager.

### Credential handling

`~/.openclaw/credentials/` at file permissions 0600, auto-excluded from VCS.
Documentation states credentials are not passed to the model. However, CVE-2026-44115
demonstrated that environment variables — including API keys — can be extracted
through heredoc shell expansion in the sandbox allowlist bypass. The credential-
not-passed-to-model guarantee depends on the sandbox perimeter holding.

### Third-party hardening ecosystem

The security gap has spawned an ecosystem: NVIDIA NemoClaw (enterprise
hardening layer), IronClaw (Rust reimplementation, privacy-first), Cisco
DefenseClaw (supply-chain scanning). The existence of this ecosystem confirms
that enterprise-grade security is not achievable from the base install alone.

---

## Hermes

### Trust and autonomy model

Hermes takes a **layered, defense-in-depth** approach designed proactively
rather than retrofitted. Seven security layers apply in sequence to every
tool call:

1. **User authorization** — Allowlists and DM pairing control who interacts at all
2. **Dangerous command approval** — Human-in-the-loop for destructive operations
3. **Container isolation** — Docker/Singularity/Modal sandboxing with hardened settings
4. **MCP credential filtering** — Environment variable isolation for MCP subprocesses
5. **Context file scanning** — Prompt injection detection before context inclusion
6. **Cross-session isolation** — Sessions cannot access each other's data
7. **Input sanitization** — Working directory parameters validated against allowlists

The role system bifurcates agents by capability: **leaf workers** cannot call
`delegate_task`, `clarify`, `memory`, or other recursion-enabling tools.
**Orchestrators** retain recursion. This structurally limits lateral movement
within a multi-agent graph.

### YOLO mode

YOLO mode bypasses dangerous command approval prompts via `--yolo` CLI flag,
`/yolo` slash command, or `HERMES_YOLO_MODE=1` environment variable. The mode
is accompanied by persistent visual warnings (red banner + status bar). A
**hardline blocklist** that YOLO cannot override blocks catastrophic patterns:
`rm -rf /`, fork bombs (`:(){ :|:& };:`), filesystem formatters (`mkfs.*`,
`dd if=/dev/zero of=/dev/sd*`). YOLO bypasses approval; the hardline blocklist
is absolute. The risk is that YOLO mode in CI/CD pipelines or automated contexts
removes the only human-in-the-loop gate for destructive operations short of
the hardline floor.

### Sandboxing

Seven execution backends offer a spectrum of isolation postures:

| Backend | Isolation level |
|---|---|
| Local | No isolation; relies on approval layer |
| Docker | cap-drop ALL; no-new-privileges; PID limits; read-only rootfs configurable; ephemeral tmpfs or persistent bind-mount |
| Singularity | HPC-grade container isolation |
| SSH | Remote execution isolation |
| Modal | Serverless isolation with hibernation |
| Daytona | Serverless with persistent workspace |
| Vercel Sandbox | Cloud sandbox |

Container backends (Docker, Singularity, Modal, Daytona, Vercel) skip the
dangerous-command approval layer entirely — the container is the security
boundary. Docker enforces `cap-drop ALL` with selective grants
(DAC_OVERRIDE, CHOWN, FOWNER only), no-new-privileges enforcement, process
limits (256 max PIDs), and restricted tmpfs (nosuid, noexec). This is more
granular than OpenClaw's recommended Docker configuration and is applied by
the framework rather than requiring operator configuration.

Additional network controls: RFC 1918, loopback, link-local, CGNAT, and cloud
metadata endpoints (169.254.169.254) are blocked by default (SSRF protection).

### Prompt-injection defense

Context files undergo pre-inclusion scanning for instruction overrides, hidden
HTML injection, secret-access attempts, exfiltration via curl, and invisible
Unicode characters. Blocked files trigger warnings; content is not loaded.
Tirith integration adds content-level scanning for homograph spoofing, pipe-
to-interpreter patterns, and terminal injection.

The critical gap is the persistent **SQLite memory store** (tracked as GitHub
issue #496, "Promptware Defense"). Attack pattern: (1) an attacker plants
hidden instructions in a shared document, (2) the user asks the agent to
summarize it, (3) the instructions persist in SQLite memory, (4) they
activate on a future unrelated query. The attack is passive and invisible
at the process level — standard EDR sees a signed Python process making
HTTPS calls and misses the memory retrieval. Hermes acknowledges this in its
own security docs but as of May 2026 the defense is incomplete (issue open).

### CVE track record

Significantly better than OpenClaw, but not zero:

**CVE-2026-22798 — CVSS 5.0 (NIST) / 5.9 (GitHub) — Medium**
Type: CWE-532, Insertion of Sensitive Information into Log File.
Hermes versions 0.8.1–0.9.0 logged `-O` argument values in plaintext.
Users passing API tokens via `hermes deposit -O invenio_rdm.auth_token SECRET`
had those tokens written to disk logs readable by any local user with log access.
Fixed in v0.9.1.

**CVE-2026-7396 — CVSS 5.3 / 5.5 (CVSS 4.0) / 5.0 (CVSS 2.0) — Medium**
Type: CWE-22, Path Traversal.
The WeChat Work Platform Adapter (`gateway/platforms/wecom.py`) in version 0.8.0
allowed path traversal manipulation through remote exploitation. No authentication
or user interaction required. Publicly exploitable. Affects a single non-default
adapter (WeChat).

**Aggregate:** Two disclosed CVEs as of May 2026, both medium severity, both
in point releases and patched promptly. No critical-severity CVEs. No
confirmed active exploitation.

One open tracking concern: GitHub issue #3970 notes that the CI/CD pipeline
uses floating tags and unpinned actions, a supply-chain hardening gap the
project has not yet closed as of the latest release notes.

### Supply-chain risk

The agentskills.io marketplace (672+ skills, 4 registries) runs a community
security scanner at submission checking for data exfiltration, prompt injection,
destructive commands, and supply-chain threats. No confirmed malicious-skill
incident exists as of May 2026. The theoretical risk mirrors ClawHub: a malicious
publisher gets install-time code execution via a skill that declares
`required_environment_variables` (which auto-registers matching env vars for
the skill) or via prompt injection embedded in the SKILL.md instructions.

### Credential handling

MCP environment filtering whitelists only PATH, HOME, USER, LANG, TERM, SHELL,
TMPDIR, and XDG_* variables. All other environment variables are stripped before
MCP subprocess launch. Explicit `env` declarations in MCP config can bypass this
filter — the bypass is intentional for legitimate integrations but requires
careful operator configuration to avoid accidental credential propagation.

Error message redaction covers GitHub PATs, OpenAI keys, bearer tokens, and
common parameter patterns before returning to the LLM. CVE-2026-22798
demonstrates that this redaction was incomplete for log output in the affected
versions — the LLM was protected but local log files were not.

---

## Vellum

### Trust and autonomy model

Vellum built **progressive trust** as its primary architectural claim and
explicit competitive positioning. The product page names OpenClaw directly:
Vellum "asks for approval until you decide to grant more freedom" while
OpenClaw offers "full autonomy with fewer guardrails." David Vargas's March
2026 blog post framed the design philosophy as: "What if the AI tried to work
against you?" — and designed the answer into the default posture.

**Actor identity** is resolved once per session and enforced uniformly:

- **Guardian**: Full system access — memories, workspace files, credentials,
  tools, configuration.
- **Trusted**: Verified contacts via configured channels; can converse and use
  allowed tools; cannot access guardian's memories, workspace files, or sensitive
  tools without explicit guardian approval.
- **Unknown**: Unverified users who receive no tool access and must pass a
  channel-appropriate challenge (invite code on Telegram/Slack/email; voice
  verification on phone) before any capabilities are granted.

The fail-closed guarantee: "Untrusted actors cannot read or write memory,
trigger tools, or escalate." The classification happens once; subsequent
messages from that actor cannot reclassify upward without guardian action.

### Trust Rules system

Trust rules are stored in a SQLite database managed by the gateway (persisted
at `~/.vellum/protected/trust.json`):

- **Pattern matching**: Minimatch glob patterns for commands, file paths, URLs
- **Priority resolution**: "Deny beats ask beats allow at equal priority. More
  specific patterns win."
- **Risk escalation**: Writes to skill directories automatically escalate to
  high-risk status, requiring explicit approval regardless of lower-level rules.
- **Skill version-hash binding**: Trust rules record the version hash of the
  skill that earned approval. If skill source files change, the hash changes
  and the user is re-prompted. A modified skill cannot silently inherit prior
  approvals.
- **Four risk tiers**: `none` (Strict — all actions prompt), `low` (Default),
  `medium` (Relaxed), `high` (Full access, analogous to OpenClaw's default
  posture).
- **Context-specific overrides**: Risk tolerance configurable per execution
  context (conversation, background, headless).

This is architecturally the most sophisticated trust persistence model of
the three products — it binds approval to both identity (actor) and code
integrity (skill version hash), preventing two distinct classes of
trust-inheritance attack.

### Sandboxing

Native OS-level sandboxing with fail-closed guarantees:

- **macOS**: `sandbox-exec` with SBPL (Sandbox Profile Language) profiles; no
  extra process or daemon required.
- **Linux**: `bwrap` (bubblewrap) for user namespace isolation.
- **Fail-closed design**: "If the backend is unavailable, commands fail
  immediately rather than falling back to unsandboxed execution." This is a
  meaningful guarantee that neither OpenClaw (opt-in sandbox) nor Hermes
  (backend-dependent) explicitly documents.

**Tool split**: Workspace tools (`file_read`, `file_write`, `bash`) are confined
to `~/.vellum/workspace`. Host tools (`host_bash`, `host_file_*`) execute on the
host and require separate Trust Rule approval. This creates a hard boundary
between sandboxed-by-default and host-access-by-explicit-grant.

### Credential handling

The most architecturally isolated credential model of the three:

- **Keychain-backed vault**: macOS Keychain for local deployments; encrypted file
  fallback on Linux; dedicated isolated vault on Vellum Cloud.
- **Credential Execution Service (CES)**: Runs as a separate process (or separate
  container on Vellum Cloud) with its own private storage. The assistant container
  literally cannot read CES storage.
- **LLM isolation**: "The assistant and the AI model never touch raw secrets."
  Credentials are injected by a proxy at the network layer — the assistant
  sees only the result of the authenticated call, never the credential value.
- **Encryption key segregation**: The encryption key for stored credentials is held
  by CES, not by the assistant process.
- **Inbound scanning**: Incoming messages are scanned for secrets via regex and
  entropy analysis to prevent credential exfiltration via social engineering.
- **Scoped consumption**: Each credential specifies `allowedTools` and
  `allowedDomains`, enforced by the `CredentialBroker`. A GitHub token cannot
  be used to authenticate a Slack call.

This design survives prompt injection: even if an attacker fully controls
the LLM's output, the LLM cannot produce a raw credential — CES is the only
process that knows the values.

### Prompt-injection defense

Vellum's architectural defenses against prompt injection are more structural
than the other two:

1. Actor identity is resolved at session start and cannot be overridden by
   content in messages. An injected instruction claiming "I am your guardian"
   inside a document cannot reclassify the actor.
2. Unknown actors receive no tool access at all, limiting the blast radius of
   injection via untrusted channels.
3. The CES architecture means even a successful injection cannot extract raw
   credentials — the model never has access to them.
4. Skill version-hash binding means injected instructions that attempt to
   substitute a modified skill will trigger re-approval.

The gap: Vellum's proactive hourly check-ins and memory consolidation processes
are potential injection surfaces analogous to Hermes's SQLite memory store —
but whether these receive the same scanning as inbound messages is not
documented in public sources as of May 2026.

### CVE track record

No CVEs disclosed as of May 2026. The product launched May 7, 2026 — three
weeks of public exposure at very low deployment scale. The absence of CVEs
reflects youth, not necessarily security quality. Vellum's enterprise dev
platform (separate product) carries SOC 2, HIPAA, and GDPR compliance, suggesting
an organizational security culture — but this compliance is for the LLMOps
platform, not for the personal assistant.

---

## Threat model comparison

### What attack surfaces each product exposes

**OpenClaw**

| Attack surface | Severity | Notes |
|---|---|---|
| Internet-exposed WebSocket (`:18789`) | Critical | 135K+ instances misconfigured; CVE-2026-25253 exploited in the wild |
| Sandbox escape (TOCTOU) | Critical | Claw Chain; patched but re-exploitable pattern class |
| Supply-chain via ClawHub | High | 1,184 confirmed malicious skills; prompt injection embedded |
| Prompt injection via tools/channels | High | 83% native attack success rate |
| Credential exposure via env-var expansion | High | CVE-2026-44115; heredoc bypass in sandbox allowlist |
| senderIsOwner flag bypass | High | CVE-2026-44118; client-controlled privilege escalation |
| Sub-agent trust inheritance | Medium | Sub-agents receive AGENTS.md + TOOLS.md only; must be passed context explicitly — potential confusion point |

**Hermes**

| Attack surface | Severity | Notes |
|---|---|---|
| SQLite memory injection (Promptware) | High | Issue #496 open; four-step silent poisoning; invisible to EDR |
| Skill marketplace supply-chain | Medium | Theoretical (no confirmed incident); scanner exists |
| YOLO mode in automated contexts | Medium | Bypasses all approval below hardline blocklist |
| Credential logging | Medium | CVE-2026-22798, fixed v0.9.1 |
| MCP env passthrough misconfiguration | Medium | Explicit `env` declarations bypass whitelist filter |
| WeChat adapter path traversal | Low | CVE-2026-7396, single non-default adapter |
| CI/CD unpinned actions | Low | Issue #3970 open; supply-chain risk in dev process, not runtime |

**Vellum**

| Attack surface | Severity | Notes |
|---|---|---|
| Memory consolidation injection | Medium (uncertain) | Hourly self-checks + vector KG retrieval could be injection surfaces; no public documentation of scanning here |
| Trust escalation via channel misconfiguration | Medium (theoretical) | If a trusted contact's channel is compromised, attacker inherits trusted-level access |
| Managed cloud dependency | Medium (deployment-specific) | Managed mode moves trust to Vellum infrastructure; self-host removes this |
| Skill marketplace (future) | Unknown | No public marketplace yet; supply-chain risk is latent |
| No battle-tested track record | Unknown | Three weeks of public exposure; CVE-free is not the same as CVE-proof |

### How each mitigates

OpenClaw's mitigation model is **perimeter hardening of a permissive default**:
the base install is wide open; operators layer on tool policies, Docker
sandboxes, authentication, and third-party tools like DefenseClaw. Security is
an operator responsibility, not a framework guarantee. This is consistent with
its Unix-tool philosophy but produces systematic risk when operators skip
hardening — and at 135K exposed instances, most did.

Hermes's model is **layered defense with container backends as the strongest
posture**: the seven-layer stack reduces attack surface incrementally, with
container-mode execution as the recommended production posture. The
architecture was designed proactively, which shows in the CVE record. The
residual risk is the memory injection surface, which is an architectural
consequence of SQLite persistence (not a configuration failure).

Vellum's model is **architectural separation and fail-closed defaults**: the
CES credential isolation, OS-level sandboxing, actor identity binding, and
skill version-hash checking are all structural properties of the default
configuration, not operator options. The model is designed to survive
adversarial LLM output — even a compromised model cannot extract raw
credentials because the model never has access to them.

---

## Head-to-head

### Who is most trustworthy by design

**Vellum is the most trustworthy by architectural design** — with the caveat
that architecture has not been stress-tested.

The CES credential model is uniquely strong: of the three products, only Vellum
makes it structurally impossible for a compromised model to produce raw
credentials, because the model is never in the data path for credential values.
The skill version-hash binding prevents silent trust inheritance after skill
modification — a class of attack neither OpenClaw nor Hermes addresses. The
fail-closed sandbox default means misconfiguration produces a visible failure,
not an invisible permission grant.

Vellum explicitly markets on this axis: the trust model is not an afterthought
or a hardening add-on, it is the primary stated differentiator. The progressive-
trust philosophy — "ask for approval until you grant more freedom" — inverts
OpenClaw's default posture, which is autonomy until restricted.

**Hermes is a credible second** on design intentionality. Seven documented
security layers, proactive design (not retrofitted), significantly smaller CVE
footprint than OpenClaw, container backends that use OS isolation instead of
approval chains. The memory injection surface is the one architectural property
that is not fully mitigated and is acknowledged as open.

**OpenClaw has the weakest trust-by-design posture and the worst track record.**
This is not a marginal gap. 138 advisories in 63 days, including two exploit
clusters with confirmed in-the-wild exploitation. CVSS scores reaching 9.9.
A CVE that let clients declare their own administrative scopes (CVE-2026-22172).
A supply-chain campaign that planted 1,184 malicious skills in its marketplace.
The core architectural issue is that OpenClaw chose full-autonomy-by-default and
has been paying the security debt ever since.

### The marketing asymmetry

Vellum explicitly named OpenClaw on its product page and positioned progressive
trust as the central differentiator. This is an unusual move for a product with
486 GitHub stars against one with 375,000. It is also accurate: OpenClaw's
CVE record substantiates the claim. The asymmetry is that OpenClaw has 3.2
million monthly active users and Vellum's assistant launched three weeks ago —
so the claim is well-founded in design but untested at adversarial scale.

The open question — which only production traffic at scale will answer — is
whether Vellum's architectural properties hold under the same adversarial
pressure OpenClaw faced, or whether new attack classes emerge against the
progressive-trust model itself (e.g., actor identity spoofing across channels,
injection through the hourly self-check process).

---

## Design considerations for a from-scratch build

These are structural observations for an implementer evaluating the security
landscape. No recommendation or product decision is implied.

**Default posture matters more than hardening options.** OpenClaw's history
suggests that operator-configurable sandboxing and tool policies produce
systematic insecurity at scale: most operators don't configure them. A from-
scratch build that chooses fail-closed defaults with explicit unlock (Vellum's
model) produces a different baseline population of deployed instances than one
that chooses full-autonomy with optional restriction (OpenClaw's model).

**Credential isolation is an architectural decision, not a config option.**
Vellum's CES model is more expensive to implement than storing credentials in
a file at 0600. The payoff is that the security guarantee survives model
compromise. The simplest version of this pattern is a separate process that
holds secrets and exposes a narrow RPC interface; the LLM output path never
touches the credential store.

**The skill/plugin marketplace supply-chain problem is structural.** ClawHub's
experience demonstrates that community-contributed skills cannot be fully
trusted at scale, regardless of initial scanning. A smaller curated skill set
with version-hash approval binding (Vellum's approach) produces a smaller
attack surface than a large marketplace with point-of-time scanning. The
tradeoff is breadth vs. security; both are real.

**Memory persistence is a prompt injection surface.** SQLite memory stores (both
Hermes and the analogous risk in any knowledge-graph-backed system) that persist
across sessions create a class of attack where a single malicious document read
today influences behavior for weeks. Defenses include memory provenance tracking
(recording where each memory item came from), memory store versioning, and
skeptical retrieval (treating retrieved memories as untrusted input rather than
ground truth).

**The WebSocket exposure problem scales with instances.** OpenClaw's loopback-
only default was correct; the 135K misconfigured instances were not caused by
a bad default — they were caused by users reconfiguring for remote access
without enabling authentication. A from-scratch build should treat remote
access as a separate, explicitly secured capability rather than a configuration
option. If the loopback constraint is too strict for a use case, the answer is
mutual TLS or equivalent, not "remove the constraint and document the risk."

**Sandboxing that fails open is not sandboxing.** Vellum's documented fail-
closed guarantee ("if the backend is unavailable, commands fail immediately
rather than falling back to unsandboxed execution") is a meaningful
differentiator. A sandbox that degrades gracefully by running unsandboxed on
backend failure provides no guaranteed security properties.

**The approval fatigue / YOLO mode tradeoff is real.** Hermes's YOLO mode
exists because users disable approval prompts when they become friction.
A from-scratch build should design the approval UX to be genuinely low-friction
for low-risk operations (so users don't need to disable it) while maintaining
high-friction for high-risk operations. The four-tier risk system Vellum
implements (none/low/medium/high) is one approach to this tradeoff.

---

## Sources

### New (fresh research for this document)

- [CVE-2026-25253 detail — NVD/NIST](https://nvd.nist.gov/vuln/detail/CVE-2026-25253) — CVSS 8.8, CWE-669, affected versions, full vector string
- [CVE-2026-25253: 1-Click RCE in OpenClaw — SocRadar](https://socradar.io/blog/cve-2026-25253-rce-openclaw-auth-token/) — Attack mechanics, token exfiltration flow
- [CVE-2026-25253 — runZero Blog](https://www.runzero.com/blog/openclaw/) — WebSocket hijacking technical detail
- [Four OpenClaw Flaws Enable Data Theft — The Hacker News](https://thehackernews.com/2026/05/four-openclaw-flaws-enable-data-theft.html) — Claw Chain CVE details, CVSS scores, attack chain
- [Claw Chain: Cyera Research — cyera.com](https://www.cyera.com/blog/claw-chain-cyera-research-unveil-four-chainable-vulnerabilities-in-openclaw) — Primary Claw Chain disclosure, CVE-2026-44112/44113/44115/44118, patch version
- [Claw Chain — SecurityWeek](https://www.securityweek.com/claw-chain-openclaw-flaws-allow-sandbox-escape-backdoor-delivery/) — Sandbox escape and backdoor delivery analysis
- [Nine CVEs in Four Days — openclawai.io](https://openclawai.io/blog/openclaw-cve-flood-nine-vulnerabilities-four-days-march-2026) — Full March cluster CVE table with CVSS scores and dates
- [OpenClaw CVE Timeline — blink.new](https://blink.new/blog/openclaw-2026-cve-complete-timeline-security-history) — 138 advisories / 63 days; formal CVE list including CVE-2026-32922 (CVSS 9.9)
- [OpenClaw Security 2026: 138 CVEs — betterclaw.io](https://www.betterclaw.io/blog/openclaw-security-2026) — Aggregate CVE statistics; 7 Critical / 49 High breakdown
- [OpenClaw Security Crisis: 135,000 Exposed Instances — SignalCage](https://signalcage.com/artificial-intelligence/2026/17/20/openclaw-security-crisis-135000-exposed-instances-and-active-infostealer-campaigns-february-2026/) — SecurityScorecard STRIKE team findings; 135K instances, 15K vulnerable to RCE, 53K correlated with breach activity
- [ClawHavoc: 1,184 Malicious Skills — CyberSecurityNews](https://cybersecuritynews.com/clawhavoc-poisoned-openclaws-clawhub/) — ClawHavoc supply chain details; 1,184 packages, 12 accounts, 91% with embedded prompt injection
- [Cisco announces DefenseClaw — Cisco Blogs](https://blogs.cisco.com/ai/cisco-announces-defenseclaw) — DefenseClaw release March 27; Cisco's response to ClawHavoc
- [The #1 Skill on OpenClaw Was Malware — Awesome Agents](https://awesomeagents.ai/news/openclaw-clawhub-malware-supply-chain/) — Supply chain incident narrative
- [CVE-2026-22798 detail — NVD/NIST](https://nvd.nist.gov/vuln/detail/CVE-2026-22798) — CVSS 5.0, CWE-532, Hermes versions 0.8.1–0.9.0, fix v0.9.1
- [CVE-2026-22798 — SentinelOne Vulnerability Database](https://www.sentinelone.com/vulnerability-database/cve-2026-22798/) — Credential logging mechanics
- [CVE-2026-7396 detail — NVD/NIST](https://nvd.nist.gov/vuln/detail/CVE-2026-7396) — CVSS 5.3 (3.1), 5.5 (4.0), CWE-22, WeChat adapter, version 0.8.0
- [Hermes Agent Security Threat Model — Repello AI](https://repello.ai/blog/hermes-agent-security) — Four core threat classes; memory injection attack flow; five defense controls; EDR visibility gap
- [Hermes Agent Security Docs — nousresearch.com](https://hermes-agent.nousresearch.com/docs/user-guide/security) — Seven security layers (authoritative); YOLO mechanics; hardline blocklist; MCP filtering; Docker cap-drop details; SSRF blocklist; Tirith integration
- [Hermes security.md — GitHub](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/security.md) — Primary source for security layer enumeration
- [Promptware Defense — GitHub Issue #496](https://github.com/NousResearch/hermes-agent/issues/496) — Memory injection tracking; "Brainworm" research reference
- [Vellum Security & Permissions — vellum.ai/docs](https://www.vellum.ai/docs/developer-guide/security) — Trust Rules SQLite schema; four risk tiers; SBPL/bwrap sandboxing; CES architecture; CredentialBroker; skill version-hash binding; fail-closed guarantee
- [Vellum Trust & Security hub — vellum.ai/docs/trust-security](https://www.vellum.ai/docs/trust-security) — Actor identity model (guardian/trusted/unknown); fail-closed design summary
- [Vellum assistant README — GitHub](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) — "Actor identity resolved once and enforced everywhere"; credentials in separate process
- [OpenClaw Sandboxing Docs — docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandboxing) — Sandbox mode/scope configuration; Docker hardening options
- [OpenClaw Security Docs — docs.openclaw.ai](https://docs.openclaw.ai/gateway/security) — Tool policy precedence cascade; "deny wins at every level"
- [arxiv.org/pdf/2603.13424 — Agent Privilege Separation](https://arxiv.org/pdf/2603.13424) — Structural defenses reducing OpenClaw attack success from 73.2% to 8.7%
- [OpenClaw Prompt Injection Guide — skywork.ai](https://skywork.ai/skypage/en/ultimate-guide-openclaw-prompt-injection/2037023209073414144) — Attack success rate ranges by attack type
- [Hermes Agent Supply Chain — mitiga.io](https://www.mitiga.io/blog/ai-agent-supply-chain-risk-silent-codebase-exfiltration-via-skills) — Skills supply-chain risk analysis; install-time vs. runtime code execution gap

### From dossiers (key references carried forward)

- [The Register: OpenClaw security issues](https://www.theregister.com/2026/02/02/openclaw_security_issues/) — "Whac-A-Mole" characterization; February 2026 landscape
- [Data Science Collective: 17% defense rate](https://medium.com/data-science-collective/355k-github-stars-in-5-months-17-defense-rate-the-complete-honest-guide-to-openclaw-28d2f59598e1) — 17% native defense rate statistic; 17% malicious skills finding
- [openclawvps.io: Statistics](https://openclawvps.io/blog/openclaw-statistics) — 9 CVEs / 4-day cluster data
- [arxiv.org/pdf/2603.27517](https://arxiv.org/pdf/2603.27517) — Systematic taxonomy of OpenClaw security vulnerabilities
- [Hermes Agent Security — Repello AI](https://repello.ai/blog/hermes-agent-security) — Seven documented layers; CVE context
- [innFactory comparison](https://innfactory.ai/en/blog/openclaw-vs-hermes-agent-comparison/) — OpenClaw CVE list vs Hermes CVE list; contributor data
