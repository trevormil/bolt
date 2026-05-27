// Boots clean under `bun run --filter dev`. The library is pure UI — no deps
// beyond React — so this just reports readiness.
import { iconNames } from "./Icon.tsx";

console.log(
  `[ui] Dusk design system ready · ${iconNames.length} icons · Button/Card/Input/Badge/Avatar`,
);
