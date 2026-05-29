import { workspaceDir } from "@vellum/shared";
import type { CapabilityStore } from "./store.ts";

// Default capability policy granted when a persona is provisioned by a surface
// (web onboarding, CLI `new`). The payment capabilities default to "allow" — the
// agent's job is to do the BitBadges machinery, and vault withdrawals are already
// bound by on-chain rules.
//
// YOLO dev capability (#52): the local filesystem (fs.read/fs.write) AND command
// execution (exec) are granted by DEFAULT — the OpenClaw / Claude-Code-style
// "full local access" posture, disclosed loudly at setup (CLI wizard + web
// onboarding) as the explicit, informed opt-in. The capability model (#37) is the
// enforcement MECHANISM; YOLO is a permissive default POLICY. CRUCIAL asymmetry,
// honestly scoped (!56 review):
//   - fs.read/fs.write are WORKSPACE-scoped — genuinely confined: the target must
//     resolve under the workspace root and the #35 symlink/`..` guard holds.
//   - exec is UNSCOPED (host-wide). A command's cwd STARTS in the workspace, but
//     `sh -c` can `cd` / touch absolute paths — exec is NOT sandboxed. Scoping it
//     `null` keeps the grant from falsely claiming workspace confinement; the
//     setup disclosure says "full host access" so consent is informed. Real
//     isolation is the future sandbox (ADR-0004). To lock down: revoke per-persona.
//
// DELIBERATE: there is NO free-form USDC spend cap on the `spend` capability. The
// vault/spend gates bind the agent's STRUCTURED money tools (withdraw, the spend
// route) — but host-wide `exec` (YOLO) can read the signing key from disk and move
// funds directly, bypassing them (!56, ADR-0004). So YOLO = full trust incl.
// funds; we do NOT claim exec is money-rule-bound. ALL structured-tool spending
// limits live in vaults (on-chain, protocol-enforced). The app-side
// guardrail on agent activity is the per-persona LLM-cost budget (#44), not a
// wallet cap. (A reviewer flagged "uncapped default spend" against an older spec
// that was since reversed — allow-by-design is intentional, not an oversight.)
//
// Provisioning happens at the surface, NOT in store.createPersona, so a raw
// engine (tests, scripts) starts default-deny and must grant explicitly.
export function grantDefaultCapabilities(
  store: CapabilityStore,
  personaId: string,
): void {
  // Unscoped "allow" grants. Money machinery (rule-bound on-chain) + exec. exec
  // is UNSCOPED on purpose: a shell command has full host access, so a workspace
  // scope would be a false confinement claim (!56). Default-deny still applies
  // without the grant; the setup disclosure makes the host-access opt-in informed.
  for (const capability of ["spend", "vault.create", "vault.withdraw", "exec"])
    store.grant({ personaId, capability, scope: null, mode: "allow" });

  // Filesystem grants ARE workspace-confined — the scope is the canonical
  // workspace root and fs.* is path-scoped (target must resolve under it; the #35
  // symlink/`..` guard holds), so these honestly stay within the workspace.
  const workspace = workspaceDir();
  for (const capability of ["fs.read", "fs.write"])
    store.grant({ personaId, capability, scope: workspace, mode: "allow" });
}
