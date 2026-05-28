import type { CapabilityStore } from "./store.ts";

// Default capability policy granted when a persona is provisioned by a surface
// (web onboarding, CLI `new`). The payment capabilities default to "allow" — the
// agent's job is to do the BitBadges machinery, and vault withdrawals are already
// bound by on-chain rules. Filesystem stays DENIED by default (no grant): the
// human must grant a specific root before the agent can touch disk (#35) — that's
// the scariest surface, so it's opt-in per-root, not blanket.
//
// DELIBERATE: there is NO free-form USDC spend cap on the `spend` capability.
// Explicit product decision — discretionary spend is uncapped; ALL spending
// limits live in vaults (on-chain, protocol-enforced). The app-side guardrail
// on agent activity is the per-persona LLM-cost budget (#44), not a wallet cap.
// (A reviewer flagged "uncapped default spend" against an older spec that was
// since reversed — allow-by-design is intentional, not an oversight.)
//
// Provisioning happens at the surface, NOT in store.createPersona, so a raw
// engine (tests, scripts) starts default-deny and must grant explicitly.
export function grantDefaultCapabilities(
  store: CapabilityStore,
  personaId: string,
): void {
  for (const capability of [
    "spend",
    "vault.create",
    "vault.withdraw",
    "schedule",
  ])
    store.grant({ personaId, capability, scope: null, mode: "allow" });
}
