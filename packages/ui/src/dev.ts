// Boots clean under `bun run --filter dev`. The library is pure UI — no deps
// beyond React — so this just reports readiness.
import { iconNames } from "./Icon.tsx";

console.log(
  `[ui] @vellum/ui ready · Dusk theme (dark default) · ${iconNames.length} icons · Button/Card/Input/Badge/Avatar`,
);
