import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  connectKeplr,
  hasKeplr,
  humanUsdcBalance,
  type ConnectedWallet,
} from "./keplr.ts";

// The connected human (Keplr) wallet — the principal's own browser wallet (0027),
// shared across the app so any human-signed flow (fund a persona, pay a payment
// request, fund a vault) can reach it.
interface WalletState {
  wallet: ConnectedWallet | null;
  usdc: string; // base µUSDC
  available: boolean; // Keplr extension present
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [usdc, setUsdc] = useState("0");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = hasKeplr();

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setUsdc(await humanUsdcBalance(wallet.address));
  }, [wallet]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const w = await connectKeplr();
      setWallet(w);
      setUsdc(await humanUsdcBalance(w.address));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setUsdc("0");
  }, []);

  // Keep the balance fresh while connected (cheap LCD poll).
  useEffect(() => {
    if (!wallet) return;
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [wallet, refresh]);

  return (
    <Ctx.Provider
      value={{
        wallet,
        usdc,
        available,
        connecting,
        error,
        connect,
        disconnect,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within WalletProvider");
  return v;
}
