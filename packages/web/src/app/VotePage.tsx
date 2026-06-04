import { useEffect, useState } from "react";
import { Button, Card, Icon } from "@vellum/ui";
import { api } from "./api.ts";
import { castVoteMsg, signAndBroadcast } from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

type Signoff = Awaited<ReturnType<typeof api.vaultSignoff>>;

// Plain-English helpers for the "what powers does this unlock authorize" block
// (#126). All defensive against missing fields — the vault might pre-date a
// given gating shape.
const shortAddr = (a: string) =>
  a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const PERIOD_LABEL: Record<"daily" | "weekly" | "monthly", string> = {
  daily: "per day",
  weekly: "per week",
  monthly: "per month",
};

// Public multisig sign-off page (#45 slice 3, model ADR-0005). A third-party
// signer opens the vault's /vote/:collectionId link, connects their own Keplr
// wallet, and casts a MsgCastVote toward the unlock quorum. Each cast is, in
// essence, a signature; once quorum is met the vault UNLOCKS — the agent may
// then withdraw from it freely (within its caps). It is a one-time authorization
// to operate the vault, not approval of a specific withdrawal.
export function VotePage({ collectionId }: { collectionId: string }) {
  const { wallet, available, connecting, connect } = useWallet();
  const [info, setInfo] = useState<Signoff | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .vaultSignoff(collectionId)
      .then(setInfo)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, [collectionId]);

  // The signer's voting weight, looked up from the vault's signer set.
  const myWeight =
    info && wallet
      ? (info.signers.find((s) => s.address === wallet.address)?.weight ?? 1)
      : 1;
  const isSigner =
    !!info &&
    !!wallet &&
    info.signers.some((s) => s.address === wallet.address);

  async function sign() {
    if (!info || !wallet) return;
    setSigning(true);
    setError(null);
    try {
      await signAndBroadcast(
        [
          castVoteMsg({
            voter: wallet.address,
            collectionId: info.collectionId,
            approvalId: info.approvalId,
            proposalId: info.proposalId,
            // Full approve = 100% yes (#83 fix). yesWeight is a 0–100 PERCENT, not
            // the signer's weight — the chain already scales by the configured
            // signer weight. Passing myWeight (e.g. 1) registered a 1% near-NO
            // vote that could never reach quorum.
            yesWeight: 100,
          }),
        ],
        `vault ${info.symbol} withdrawal sign-off`,
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-base p-4 text-fg font-sans">
      <Card className="w-[26rem] p-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/logos/bolt.png"
            alt="Bolt"
            className="h-9 w-9 rounded-lg object-cover shadow-glow"
          />
          <div className="leading-tight">
            <div className="font-serif text-xl">Vault sign-off</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
              Bolt · multisig
            </div>
          </div>
        </div>

        {loadErr ? (
          <p className="mt-5 text-sm text-danger">{loadErr}</p>
        ) : !info ? (
          <p className="mt-5 text-sm text-muted">Loading…</p>
        ) : done ? (
          <div className="mt-5 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
              <Icon name="check" size={24} />
            </span>
            <p className="text-lg">Signed</p>
            <p className="mt-1 text-sm text-muted">
              Your vote was cast for {info.symbol}. Once {info.threshold} of{" "}
              {info.signers.length} signers approve, the vault unlocks and the
              agent can withdraw from it (within the vault's limits).
            </p>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-muted">
              You're authorizing the agent to withdraw from the{" "}
              <span className="text-fg">{info.name}</span> vault ({info.symbol}
              ). This is a <span className="text-fg">one-time unlock</span> —
              once enough signers approve, the agent can withdraw from this
              vault going forward, within its limits. It is not approval of a
              single payment.
            </p>

            {/* Plain-English scope (#126) — the powers this unlock authorizes,
                so the signer knows what they're handing over. */}
            <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-base/40 p-3 text-xs">
              <div className="font-mono uppercase tracking-[0.18em] text-soft">
                What you're authorizing
              </div>
              <div className="text-fg">
                <span className="text-soft">Agent:</span>{" "}
                <span>{info.personaName}</span>{" "}
                <span className="font-mono text-soft">
                  ({shortAddr(info.agentAddress)})
                </span>
              </div>
              <div className="text-fg">
                <span className="text-soft">Withdrawal limit:</span>{" "}
                {info.gating.amount ? (
                  <span>
                    up to ${info.gating.amount.limitUsd.toFixed(2)} USDC{" "}
                    {PERIOD_LABEL[info.gating.amount.period]}
                  </span>
                ) : (
                  <span className="text-warn">
                    none configured (agent can withdraw any amount)
                  </span>
                )}
              </div>
              {info.gating.time && (
                <div className="text-fg">
                  <span className="text-soft">Window:</span>{" "}
                  {info.gating.time.unlockAt != null && (
                    <span>from {fmtDate(info.gating.time.unlockAt)}</span>
                  )}
                  {info.gating.time.unlockAt != null &&
                    info.gating.time.expiresAt != null &&
                    " "}
                  {info.gating.time.expiresAt != null && (
                    <span>until {fmtDate(info.gating.time.expiresAt)}</span>
                  )}
                </div>
              )}
              <div className="text-fg">
                <span className="text-soft">Manager kill-switch:</span>{" "}
                <span className="font-mono">
                  {shortAddr(info.managerAddress)}
                </span>{" "}
                <span className="text-soft">
                  — can drain or revoke at any time
                </span>
              </div>
            </div>

            <div className="mt-3 text-xs text-soft">
              Requires {info.threshold} of {info.signers.length} signer
              approvals · collection {info.collectionId}
            </div>

            {info.tally && (
              <div className="mt-3 rounded-lg border border-border bg-base/40 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-soft">Signed so far</span>
                  <span
                    className={info.tally.quorumMet ? "text-accent" : "text-fg"}
                  >
                    {info.tally.signedCount} of {info.tally.totalSigners}
                    {info.tally.quorumMet ? " · quorum met ✓" : " · pending"}
                  </span>
                </div>
              </div>
            )}
            {info.tallyError && (
              <div className="mt-2 text-[11px] text-soft">
                Live sign-off count is unavailable right now.
              </div>
            )}

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <div className="mt-6">
              {!available ? (
                <p className="text-sm text-danger">
                  Keplr extension not detected — install it to sign.
                </p>
              ) : !wallet ? (
                <Button
                  className="w-full"
                  onClick={connect}
                  disabled={connecting}
                >
                  <Icon name="wallet" size={16} />{" "}
                  {connecting ? "Connecting…" : "Connect Keplr"}
                </Button>
              ) : !isSigner ? (
                <p className="text-sm text-danger">
                  This wallet ({wallet.address.slice(0, 12)}…) isn't on the
                  vault's signer list.
                </p>
              ) : (
                <Button className="w-full" onClick={sign} disabled={signing}>
                  {signing ? "Signing…" : "Approve unlock"}
                </Button>
              )}
            </div>
            {wallet && isSigner && (
              <p className="mt-2 text-center text-xs text-soft">
                signing as {wallet.address.slice(0, 14)}… (weight {myWeight})
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
