// What the top-bar wallet popover (and every other place that shows the browser's wallet connection) says, from ONE pure function. It is unit-tested.
// Connected means Freighter answered on Testnet. A wrong network, a locked wallet, or a missing one is never "connected". Verified is only what the backend
// records for the signed-in account. Nothing here prompts Freighter; the actions are only names, and the component decides what a click does.
import type { WalletView } from "./freighter.ts";

/** One string, used on the top bar, the Wallets tab and the sign-in window. */
export const WRONG_NETWORK_MESSAGE = "Tobin supports Stellar Testnet only in this build. Switch Freighter to Testnet.";

export const DISCONNECT_TITLE = "Disconnect this wallet?";
export const DISCONNECT_DESCRIPTION = "This removes the verified record of this wallet from your Tobin account and signs out every Tobin session that used it. It does not delete or change the Stellar account, and nothing on Stellar is affected.";
export const FREIGHTER_REVOKE_NOTE = "Tobin cannot remove its own access inside Freighter, because a website cannot revoke it. To revoke that permission as well, open Freighter's connected sites and remove Tobin there.";
export const DISCONNECT_LAST_METHOD_NOTE = "If it is the only way your account can sign in, the server refuses and says so.";

export type PopoverStateId = "detecting" | "not-found" | "not-connected" | "locked-or-denied" | "connected-verified" | "connected-unverified" | "wrong-network";
export type PopoverAction = "connect" | "check-again" | "disconnect" | "manage";

export interface PopoverState {
  id: PopoverStateId;
  /** the short text under the address in the top bar, also its accessible name */
  barLabel: string;
  title: string;
  /** shown as "Connected" in the popover rows: true only when Freighter answered on Testnet */
  connected: boolean;
  /** what Freighter itself said, when it said something (shown quietly) */
  detail: string | null;
  lines: string[];
  actions: PopoverAction[];
}

export function walletPopoverState(wallet: WalletView, verifiedForAccount: boolean): PopoverState {
  switch (wallet.kind) {
    case "DETECTING":
      return { id: "detecting", barLabel: "Checking", title: "Checking for Freighter", connected: false, detail: null, lines: ["Looking for a wallet in this browser."], actions: [] };
    case "UNAVAILABLE":
      return { id: "not-found", barLabel: "Freighter not found", title: "Freighter not found", connected: false, detail: wallet.reason || null, lines: ["Freighter was not found in this browser. Install the extension, then check again."], actions: ["check-again"] };
    case "NOT_ALLOWED":
      return wallet.cause === "locked-or-denied"
        ? { id: "locked-or-denied", barLabel: "Locked or declined", title: "Freighter is locked or access was declined", connected: false, detail: wallet.reason || null, lines: ["Unlock Freighter, or approve the access request, then connect again."], actions: ["connect", "check-again"] }
        : { id: "not-connected", barLabel: "Not connected", title: "Freighter is installed, not connected", connected: false, detail: null, lines: ["This site has not been given access in Freighter yet. Connecting opens a Freighter window that you approve."], actions: ["connect", "check-again"] };
    case "WRONG_NETWORK":
      return { id: "wrong-network", barLabel: "Wrong network", title: "Wrong network", connected: false, detail: `Freighter is on ${wallet.network}.`, lines: [WRONG_NETWORK_MESSAGE], actions: ["check-again"] };
    case "READY":
      return verifiedForAccount
        ? { id: "connected-verified", barLabel: "Connected, verified", title: "Connected and verified", connected: true, detail: null, lines: ["Freighter is connected on Testnet, and Tobin has a verified record of this key for your account. Neither grants a role or signing authority in Tobin."], actions: ["disconnect", "manage"] }
        : { id: "connected-unverified", barLabel: "Connected, not verified", title: "Connected, not verified", connected: true, detail: null, lines: ["Freighter is connected on Testnet, but Tobin has no verified record of this key for your account, so Tobin has nothing to disconnect. To stop this site using the wallet, remove Tobin's access inside Freighter."], actions: ["manage"] };
  }
}
