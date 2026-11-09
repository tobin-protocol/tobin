"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatDate, formatDateTime } from "../../lib/format.ts";
import { WALLET_BUTTON_LABEL, WALLET_NOTE, walletRows, type WalletRow } from "../../lib/org/rules.ts";
import { WRONG_NETWORK_MESSAGE } from "../../lib/wallet/popover.ts";
import { DisconnectWalletDialog } from "./DisconnectWalletDialog.tsx";
import { client } from "../../lib/tobin/index.ts";
import { useWallet } from "../wallet/WalletProvider.tsx";
import { useConnectWallet } from "../auth/ConnectWallet.tsx";
import { useMe, useWorkspace } from "../shell/session.tsx";
import { CopyButton } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { Identifier, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, InlineError, Skeleton } from "../ui/Feedback.tsx";
import { SidePanel } from "../ui/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";

export const NO_AUTHORITY = "Application roles never grant signing authority, and a verified wallet confers no role, no reviewer capability and no signing authority in Tobin.";

/** Recorded signer-set snapshots of one account, read on request. Information only: it grants no role and authorizes nothing. */
function SignerHistory({ orgId, account }: { orgId: string; account: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["org-signer-sets", orgId, account], queryFn: () => client.organizations.signerSetHistory(orgId, account), enabled: open });
  return (
    <div className="w-full">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide signer-set history" : "Signer-set history"}</Button>
      {open ? (
        <div className="mt-2 text-body">
          {q.isLoading ? <Skeleton lines={2} /> : q.error ? <InlineError>{(q.error as Error).message}</InlineError> : q.data!.history.length === 0 ? <p className="text-muted">No signer set has been recorded for this account.</p> : (
            <ul className="divide-y divide-divider">{q.data!.history.map((h) => <li key={h.fingerprint + h.recordedAt} className="flex flex-wrap justify-between gap-2 py-1.5"><Identifier value={h.fingerprint} head={10} tail={6} /><span className="text-muted">Recorded {formatDateTime(h.recordedAt)}</span></li>)}</ul>
          )}
          <p className="mt-1 text-muted">Read from the chain and recorded by Tobin. Information only: it grants no role and authorizes no transaction.</p>
        </div>
      ) : null}
    </div>
  );
}

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
            <ul className="divide-y divide-divider">{claims.data!.map((c) => <li key={c.address} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><Identifier value={c.address} head={10} tail={6} /><span className="text-body text-muted">{c.proof === "signature-verified" ? "Signature verified" : "Unproven claim"}</span><SignerHistory orgId={org.id} account={c.address} /></li>)}</ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** The wallets of the signed-in account, as the backend returns them. It is the body of the Organization page's Wallets tab. */
export function WalletsPanel() {
  const connect = useConnectWallet();
  const me = useMe();
  const wallet = useWallet();
  const [open, setOpen] = useState<WalletRow | null>(null);
  const [confirm, setConfirm] = useState<WalletRow | null>(null);
  // only Freighter on Testnet is a connection; a wrong network is never shown as connected
  const browserAddress = wallet.wallet.kind === "READY" ? wallet.wallet.address : null;
  const rows = walletRows(me.data?.wallets ?? [], browserAddress);

  const cols: Col<WalletRow>[] = [
    { id: "addr", header: "Address", cell: (r) => <Identifier value={r.publicKey} head={8} tail={6} /> },
    { id: "net", header: "Network", cell: (r) => (r.network === "testnet" ? "Stellar Testnet" : r.network), hideBelow: "md" },
    { id: "conn", header: "Connection", cell: (r) => <span className={r.connection.startsWith("Connected") ? "font-medium" : "text-muted"}>{r.connection === "Connected in this browser" ? "Connected" : "Not connected"}</span> },
    { id: "ver", header: "Verification", cell: (r) => r.verification },
    { id: "when", header: "Associated", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.verifiedAt)}</span>, hideBelow: "md" },
    { id: "act", header: "", align: "right", cell: (r) => <Button variant="quiet" onClick={() => setOpen(r)} aria-label={`Details of wallet ${r.publicKey.slice(0, 8)}`}>Details</Button> },
  ];

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
          <div className="mt-3"><Button onClick={connect.open}>{WALLET_BUTTON_LABEL}</Button></div>
          <p className="mt-2 max-w-prose text-label text-muted" role="note">{WALLET_NOTE}</p>
          <p className="mt-3 text-label text-muted">The backend records no wallet provider, so none is shown.</p>
        </Card>

        <Card>
          <h2 className="text-entity font-medium">Wallet in this browser</h2>
          <div className="mt-2 text-body">
            {wallet.wallet.kind === "DETECTING" ? <span className="text-muted">Checking for Freighter…</span>
              : wallet.wallet.kind === "UNAVAILABLE" ? <span className="text-muted">Freighter was not found in this browser.</span>
              : wallet.wallet.kind === "NOT_ALLOWED" ? <span className="text-muted">Freighter is installed but this site is not allowed. {wallet.wallet.reason}</span>
              : wallet.wallet.kind === "WRONG_NETWORK" ? <span><Identifier value={wallet.wallet.address} head={8} tail={6} /> <span className="text-muted">Not connected. Freighter is on {wallet.wallet.network}. {WRONG_NETWORK_MESSAGE}</span></span>
              : <span><Identifier value={wallet.wallet.address} head={8} tail={6} /> <span className="text-muted">Connected on {wallet.wallet.network}</span></span>}
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
            <Button variant="destructive" onClick={() => setConfirm(open)}>Disconnect wallet</Button>
          </div>
        ) : null}
      </SidePanel>

      <DisconnectWalletDialog wallet={confirm} onClose={() => setConfirm(null)} onDone={() => setOpen(null)} />
    </>
  );
}
