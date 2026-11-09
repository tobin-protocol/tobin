"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DISCONNECT_DESCRIPTION, DISCONNECT_LAST_METHOD_NOTE, DISCONNECT_TITLE, FREIGHTER_REVOKE_NOTE } from "../../lib/wallet/popover.ts";
import { client } from "../../lib/tobin/index.ts";
import { reasonOf } from "../sessions/shared.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { useWorkspace } from "../shell/session.tsx";

/** The one Disconnect confirmation, shared by the top-bar popover and the Wallets tab. It calls the backend (revokes the verified record) and says what that does and does not do. */
export function DisconnectWalletDialog({ wallet, onClose, onDone }: { wallet: { id: string; publicKey: string } | null; onClose: () => void; onDone?: () => void }) {
  const { org } = useWorkspace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { setError(null); onClose(); };
  const disconnect = async () => {
    if (!wallet) return;
    setBusy(true); setError(null);
    try {
      await client.auth.removeWallet(wallet.id);
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["org-verifications", org.id] });
      onDone?.(); close();
    } catch (e) { setError(reasonOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!wallet} onClose={close} destructive title={DISCONNECT_TITLE} description={DISCONNECT_DESCRIPTION} primary={{ label: "Disconnect wallet", onClick: disconnect, loading: busy }}>
      {wallet ? <p className="break-all font-mono text-ident">{wallet.publicKey}</p> : null}
      <p className="mt-2 text-label text-muted">{FREIGHTER_REVOKE_NOTE}</p>
      <p className="mt-2 text-label text-muted">{DISCONNECT_LAST_METHOD_NOTE}</p>
      {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
    </Dialog>
  );
}
