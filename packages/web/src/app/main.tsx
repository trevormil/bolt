import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PayPage } from "./PayPage.tsx";
import { VotePage } from "./VotePage.tsx";
import { WalletProvider } from "./wallet-context.tsx";
import "./styles.css";

// PWA service worker (#38). The install/activate handler is in /sw.js (Vite
// serves /public verbatim). Registration is prod-only — Vite's dev server
// serves /sw.js with `no-cache` but with cross-Origin headers that conflict
// with SW scope rules; prod builds work cleanly. Failures are non-fatal:
// the app still works without the SW; install just won't be offered.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[vellum] SW registration failed:", err));
  });
}

// Minimal path routing — standalone public routes are the pay page (/pay/:id)
// and the multisig sign-off page (/vote/:collectionId). Everything else is the
// single-page app. (No router dep needed.)
const payMatch = window.location.pathname.match(/^\/pay\/([^/]+)/);
const voteMatch = window.location.pathname.match(/^\/vote\/([^/]+)/);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletProvider>
      {payMatch ? (
        <PayPage reqId={decodeURIComponent(payMatch[1]!)} />
      ) : voteMatch ? (
        <VotePage collectionId={decodeURIComponent(voteMatch[1]!)} />
      ) : (
        <App />
      )}
    </WalletProvider>
  </React.StrictMode>,
);
