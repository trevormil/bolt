import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PayPage } from "./PayPage.tsx";
import { WalletProvider } from "./wallet-context.tsx";
import "./styles.css";

// Minimal path routing — the only standalone route is the public pay page
// (/pay/:id). Everything else is the single-page app. (No router dep needed.)
const payMatch = window.location.pathname.match(/^\/pay\/([^/]+)/);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletProvider>
      {payMatch ? (
        <PayPage reqId={decodeURIComponent(payMatch[1]!)} />
      ) : (
        <App />
      )}
    </WalletProvider>
  </React.StrictMode>,
);
