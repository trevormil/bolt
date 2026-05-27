import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// SPA dev server proxies /api → the Hono server (bun run dev:api on :8787).
// Production build emits dist/, which the Hono server serves statically.
export default defineConfig({
  plugins: [
    react(),
    // The BitBadges SDK + cosmjs (client-side Keplr signing, 0027) expect Node
    // globals/builtins — Buffer, process, crypto, stream — which the browser
    // lacks. Next.js supplies these for free (the Meridian reference); Vite
    // needs explicit polyfills.
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", emptyOutDir: true },
  // @vellum/ui ships TS source (workspace) — let Vite transform it, don't prebundle.
  optimizeDeps: { exclude: ["@vellum/ui"] },
});
