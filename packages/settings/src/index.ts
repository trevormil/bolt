// @vellum/settings — per-persona settings framework (#40). Generic global/persona
// JSON store with `persona → global → default` resolution + provenance, plus a
// typed `defineSetting` accessor. The shared mechanism behind #41/#43/#44.
export {
  SettingsStore,
  GLOBAL,
  type Resolved,
  type SettingSource,
} from "./store.ts";
export { defineSetting, type SettingDef } from "./settings.ts";
