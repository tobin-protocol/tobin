// The wallets the connect dialog can list. A registry in code, so adding a wallet is one entry plus its adapter; today only Freighter is supported, through the
// pinned @stellar/freighter-api (decision D4). Pure, so it is unit-tested. Nothing here claims support for a wallet Tobin has no adapter for.

export interface WalletEntry {
  id: string;
  name: string;
  /** where a visitor installs it */
  installUrl: string;
  /** true only while an adapter exists in this app */
  supported: boolean;
  /** a desktop browser extension that does not run in a phone browser */
  desktopExtension: boolean;
}

export const WALLET_REGISTRY: readonly WalletEntry[] = [
  { id: "freighter", name: "Freighter", installUrl: "https://www.freighter.app", supported: true, desktopExtension: true },
];

export type WalletLabel = "INSTALLED" | "NOT INSTALLED" | "LAST USED";
export interface WalletRow { entry: WalletEntry; installed: boolean | "checking"; lastUsed: boolean; labels: WalletLabel[] }

/** Installed wallets first, then the rest in registry order. A wallet that is still being detected counts as not installed for ordering only. */
export function orderWallets(entries: readonly WalletEntry[], installed: Readonly<Record<string, boolean | "checking">>, lastUsedId: string | null): WalletRow[] {
  const rows = entries.filter((e) => e.supported).map((entry): WalletRow => {
    const inst = installed[entry.id] ?? false;
    const labels: WalletLabel[] = [];
    if (inst === true) labels.push("INSTALLED"); else if (inst === false) labels.push("NOT INSTALLED");
    if (lastUsedId === entry.id) labels.push("LAST USED");
    return { entry, installed: inst, lastUsed: lastUsedId === entry.id, labels };
  });
  return rows.map((r, i) => ({ r, i })).sort((a, b) => Number(b.r.installed === true) - Number(a.r.installed === true) || a.i - b.i).map((x) => x.r);
}

/** A search field only earns its place above about six wallets. */
export const SEARCH_THRESHOLD = 6;
export const showSearch = (count: number) => count > SEARCH_THRESHOLD;
export const filterWallets = (rows: readonly WalletRow[], query: string) => { const q = query.trim().toLowerCase(); return q ? rows.filter((r) => r.entry.name.toLowerCase().includes(q)) : [...rows]; };

const KEY = "tobin.lastWallet";
export const readLastWallet = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const rememberWallet = (id: string): void => { try { localStorage.setItem(KEY, id); } catch { /* storage may be blocked; the label is a convenience */ } };
