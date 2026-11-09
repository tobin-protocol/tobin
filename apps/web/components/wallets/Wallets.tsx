"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDate, formatDateTime } from "../../lib/format.ts";
import { walletRows, type WalletRow } from "../../lib/org/rules.ts";
import { client } from "../../lib/tobin/index.ts";
import { useWallet } from "../wallet/WalletProvider.tsx";
import { useConnectWallet } from "../auth/ConnectWallet.tsx";
import { useMe, useWorkspace } from "../shell/session.tsx";
import { CopyButton, reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { Identifier, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, InlineError, Skeleton } from "../ui/Feedback.tsx";
import { Dialog, SidePanel } from "../ui/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";

export const NO_AUTHORITY = "Application roles never grant signing authority, and a verified wallet confers no role, no reviewer capability and no signing authority in Tobin.";

/** Verified accounts of the organization and its (unproven) wallet claims: read-only, reused by the Organization page's Wallets tab. */
export function OrgWallets() {
  const { org } = useWorkspace();
  const ver = useQuery({ queryKey: ["org-verifications", org.id], queryFn: () => client.organizations.verifications(org.id) });
  const claims = useQuery({ queryKey: ["org-claims", org.id], queryFn: () => client.organizations.claims(org.id) });
  const cols: Col<NonNullable<typeof ver.data>[number]>[] = [
    { id: "who", header: "Member", cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: "addr", header: "Address", cell: (r) => <Identifier value={r.publicKey} head={8} tail={6} /> },
    { id: "net", header: "Network", cell: (r) => (r.network === "testnet" ? "Stellar Testnet" : r.network), hideBelow: "md" },
    { id: "when", header: "Verified", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.verifiedAt)}</span> },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Verified accounts</h2>
        <p className="mt-1 text-body text-muted">Members who proved control of a Stellar key to Tobin. {NO_AUTHORITY}</p>
        <div className="mt-3">
          <Table columns={cols} data={ver.data ?? []} getRowId={(r) => `${r.userId}-${r.publicKey}`} loading={ver.isLoading} error={ver.error ? (ver.error as Error).message : null} onRetry={() => ver.refetch()}
            empty={<EmptyState title="No verified accounts" message="No member has verified a wallet in this organization." />} />
        </div>
      </Card>
      <Card>
        <h2 className="text-entity font-medium">Organization wallet claims</h2>
        <p className="mt-1 text-body text-muted">Addresses recorded for the organization. A claim is not proof of control.</p>
        <div className="mt-3">
          {claims.isLoading ? <Skeleton lines={2} /> : claims.error ? <InlineError>{(claims.error as Error).message}</InlineError> : (claims.data ?? []).length === 0 ? <p className="text-body text-muted">No claims are recorded.</p> : (
            <ul className="divide-y divide-divider">{claims.data!.map((c) => <li key={c.address} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><Identifier value={c.address} head={10} tail={6} /><span className="text-body text-muted">{c.proof === "signature-verified" ? "Signature verified" : "Unproven claim"}</span></li>)}</ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** The wallets of the signed-in account, as the backend returns them. It is the body of the Organization page's Wallets tab. */
export function WalletsPanel() {
  const { org } = useWorkspace();
  const connect = useConnectWallet();
  const me = useMe();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [open, setOpen] = useState<WalletRow | null>(null);
  const [confirm, setConfirm] = useState<WalletRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browserAddress = wallet.wallet.kind === "READY" || wallet.wallet.kind === "WRONG_NETWORK" ? wallet.wallet.address : null;
  const rows = walletRows(me.data?.wallets ?? [], browserAddress);

  const cols: Col<WalletRow>[] = [
    { id: "addr", header: "Address", cell: (r) => <Identifier value={r.publicKey} head={8} tail={6} /> },
    { id: "net", header: "Network", cell: (r) => (r.network === "testnet" ? "Stellar Testnet" : r.network), hideBelow: "md" },
    { id: "conn", header: "Connection", cell: (r) => <span className={r.connection.startsWith("Connected") ? "font-medium" : "text-muted"}>{r.connection === "Connected in this browser" ? "Connected" : "Not connected"}</span> },
    { id: "ver", header: "Verification", cell: (r) => r.verification },
    { id: "when", header: "Associated", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.verifiedAt)}</span>, hideBelow: "md" },
    { id: "act", header: "", align: "right", cell: (r) => <Button variant="quiet" onClick={() => { setError(null); setOpen(r); }} aria-label={`Details of wallet ${r.publicKey.slice(0, 8)}`}>Details</Button> },
  ];

  const disconnect = async () => {
    if (!confirm) return;
    setBusy(true); setError(null);
    try { await client.auth.removeWallet(confirm.id); setConfirm(null); setOpen(null); await qc.invalidateQueries({ queryKey: ["me"] }); await qc.invalidateQueries({ queryKey: ["org-verifications", org.id] }); }
    catch (e) { setError(reasonOf(e)); setConfirm(null); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="space-y-4">
        <Card>
          <h2 className="text-entity font-medium">Your wallets</h2>
          <p className="mt-1 text-body text-muted">Connection is what this browser&apos;s Freighter reports right now. Verification is what Tobin recorded when you proved control of the key. They are separate: a connected wallet is not a verified one.</p>
          <div className="mt-3">
            {me.isLoading ? <Skeleton lines={3} /> : me.error ? <ErrorState title="Could not load your wallets" message={(me.error as Error).message} retry={<Button onClick={() => me.refetch()}>Try again</Button>} /> : (
              <Table columns={cols} data={rows} getRowId={(r) => r.id} empty={<EmptyState title="No verified wallet" message="No wallet is linked to this account. The backend lists none." />} />
            )}
          </div>
          <div className="mt-3"><Button onClick={connect.open}>Link wallet</Button></div>
          <p className="mt-2 max-w-prose text-label text-muted" role="note">Link wallet opens the Connect wallet window, which only looks for a wallet in this browser. Linking is not verification: nothing is signed here, and Tobin records proof of control only for wallets listed above as verified.</p>
          {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
          <p className="mt-3 text-label text-muted">The backend records no wallet provider, so none is shown.</p>
        </Card>

        <Card>
          <h2 className="text-entity font-medium">Wallet in this browser</h2>
          <div className="mt-2 text-body">
            {wallet.wallet.kind === "DETECTING" ? <span className="text-muted">Checking for Freighter…</span>
              : wallet.wallet.kind === "UNAVAILABLE" ? <span className="text-muted">Freighter was not found in this browser.</span>
              : wallet.wallet.kind === "NOT_ALLOWED" ? <span className="text-muted">Freighter is installed but this site is not allowed. {wallet.wallet.reason}</span>
              : <span><Identifier value={wallet.wallet.address} head={8} tail={6} /> <span className="text-muted">on {wallet.wallet.network}{wallet.wallet.kind === "WRONG_NETWORK" ? ". Switch Freighter to Testnet." : ""}</span></span>}
          </div>
        </Card>

        <OrgWallets />
        <p className="rounded-card bg-card p-4 text-body text-muted" role="note">{NO_AUTHORITY}</p>
      </div>

      <SidePanel open={!!open} onClose={() => setOpen(null)} title="Wallet">
        {open ? (
          <div className="space-y-4">
            <div className="rounded-card bg-card p-4">
              <p className="text-label uppercase tracking-wide text-muted">Address</p>
              <p className="mt-1 break-all font-mono text-ident">{open.publicKey}</p>
              <div className="mt-3"><CopyButton value={open.publicKey} label="Copy address" /></div>
            </div>
            <div className="rounded-card bg-card p-4">
              <StatGrid columns={2} items={[
                { label: "Network", value: open.network === "testnet" ? "Stellar Testnet" : open.network },
                { label: "Connection", value: open.connection === "Connected in this browser" ? "Connected" : "Not connected", hint: "This browser's Freighter" },
                { label: "Verification", value: open.verification, hint: "Proof of control, recorded by Tobin" },
                { label: "Associated", value: formatDateTime(open.verifiedAt) },
              ]} />
            </div>
            <p className="text-body text-muted" role="note">{NO_AUTHORITY}</p>
            <Button variant="destructive" onClick={() => { setError(null); setConfirm(open); }}>Disconnect wallet</Button>
          </div>
        ) : null}
      </SidePanel>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} destructive title="Disconnect this wallet?" description="This removes the verified wallet from your Tobin account and signs out every session that used it. It does not delete or change the Stellar account, and nothing on Stellar is affected." primary={{ label: "Disconnect wallet", onClick: disconnect, loading: busy }}>
        {confirm ? <p className="break-all font-mono text-ident">{confirm.publicKey}</p> : null}
        <p className="mt-2 text-label text-muted">If it is the only way your account can sign in, the server refuses and says so.</p>
      </Dialog>
    </>
  );
}
