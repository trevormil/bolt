import { workspaceDir } from "@vellum/shared";
import type { CapabilityStore } from "./store.ts";

// Default capability policy granted when a persona is provisioned by a surface
// (web onboarding, CLI `new`). The payment capabilities default to "allow" — the
// agent's job is to do the BitBadges machinery, and vault withdrawals are already
// bound by on-chain rules.
//
// YOLO dev capability (#52): the local filesystem (fs.read/fs.write) AND command
// execution (exec) are granted by DEFAULT, scoped to the agent workspace. This is
// the OpenClaw / Claude-Code-style "full local access in a workspace" posture,
// disclosed loudly at setup (CLI wizard + web onboarding). The capability model
// (#37) remains the enforcement MECHANISM — YOLO is just a permissive default
// POLICY: grants are scoped to the workspace root, so the agent still can't touch
// disk or run commands outside it, and the #35 symlink/`..` escape guards still
// apply. To lock the agent down, revoke these grants per-persona.
//
// DELIBERATE: there is NO free-form USDC spend cap on the `spend` capability, and
// MONEY stays rule-bound regardless of YOLO — vault.create/withdraw are still
// gated + on-chain-bound, and exec is local-only (it can't move funds). ALL
// spending limits live in vaults (on-chain, protocol-enforced). The app-side
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
  // Unscoped "allow" grants — money + scheduling machinery.
  for (const capability of [
    "spend",
    "vault.create",
    "vault.withdraw",
    "schedule",
  ])
    store.grant({ personaId, capability, scope: null, mode: "allow" });

  // Workspace-scoped YOLO dev grants. The scope must be the canonical workspace
  // path the fs/exec tools authorize against (they resolve via workspaceDir()),
  // so both sides match: fs.* is path-scoped (target must resolve under the
  // root); exec matches scope==target exactly.
  const workspace = workspaceDir();
  for (const capability of ["fs.read", "fs.write", "exec"])
    store.grant({ personaId, capability, scope: workspace, mode: "allow" });
}
