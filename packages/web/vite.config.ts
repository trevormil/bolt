import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA dev server proxies /api → the Hono server (bun run dev:api on :8787).
// Production build emits dist/, which the Hono server serves statically.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", emptyOutDir: true },
  // @vellum/ui ships TS source (workspace) — let Vite transform it, don't prebundle.
  optimizeDeps: { exclude: ["@vellum/ui"] },
});
