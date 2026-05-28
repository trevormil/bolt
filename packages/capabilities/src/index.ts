// @vellum/capabilities — the local capability/permission model (#37). Per-persona
// grants (default-deny, scoped) + a single Authorizer enforcement point every
// gated action (filesystem #35, cron #36, mcp, spend) passes through. Fail-closed:
// an "ask" decision with no approver wired denies. Every decision is recorded.
export {
  CapabilityStore,
  type Grant,
  type CapabilityMode,
  type Decision,
} from "./store.ts";
export {
  Authorizer,
  type AuthAction,
  type Approver,
  type AuthLedger,
  type AuthorizerOptions,
} from "./authorizer.ts";
export { grantDefaultCapabilities } from "./defaults.ts";
