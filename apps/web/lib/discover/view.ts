// Pure view logic for the Discover explorer: tabs, sort options, the stats row, and what a tile may say. Tested in test/discover.test.ts.
import { formatAmount, formatDateTime, middle } from "../format.ts";
import { verifiedMark } from "../stages.ts";
import type { AssetSort, DiscoverResult, DiscoverTab, InstitutionSort, ProtocolStats, PublicAsset, PublicInstitution, PublicNetwork, PublicSettlement, SettlementSort } from "./types.ts";

export const TABS: { id: DiscoverTab; label: string }[] = [
  { id: "settlements", label: "Settlements" },
  { id: "institutions", label: "Institutions" },
  { id: "assets", label: "Assets" },
];

export const SORTS = {
  settlements: [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "amount-high", label: "Amount: high to low" }, { value: "amount-low", label: "Amount: low to high" }],
  institutions: [{ value: "name", label: "Name: A to Z" }, { value: "newest", label: "Newest first" }, { value: "most-settlements", label: "Most settlements" }],
  assets: [{ value: "code", label: "Code: A to Z" }, { value: "most-settlements", label: "Most settlements" }, { value: "latest", label: "Latest settlement" }],
} as const satisfies Record<DiscoverTab, readonly { value: string; label: string }[]>;

export const parseTab = (raw: string | null | undefined): DiscoverTab => TABS.find((t) => t.id === raw)?.id ?? "settlements";
/** An unknown or missing sort falls back to the tab's first option, so a hand-edited URL never breaks the page. */
export function parseSort<T extends DiscoverTab>(tab: T, raw: string | null | undefined): (typeof SORTS)[T][number]["value"] {
  const options = SORTS[tab] as readonly { value: string }[];
  return (options.find((o) => o.value === raw)?.value ?? options[0]!.value) as (typeof SORTS)[T][number]["value"];
}
export type AnySort = SettlementSort | InstitutionSort | AssetSort;

export const EMPTY_TILE = { title: "No data", body: "Public settlement data is not available yet." } as const;

export function statsView(result: DiscoverResult<ProtocolStats> | undefined): { label: string; value: string }[] {
  const s = result?.kind === "ok" ? result.data : null;
  const count = (n: number | null | undefined) => (typeof n === "number" ? String(n) : "No data");
  return [
    { label: "Settlements recorded", value: count(s?.settlementsRecorded) },
    { label: "Institutions opted in", value: count(s?.institutionsOptedIn) },
    { label: "Assets in use", value: count(s?.assetsInUse) },
    { label: "Last settlement", value: s?.lastSettlementAt ? formatDateTime(s.lastSettlementAt) : "No data" },
  ];
}

export const NETWORK_LABEL: Record<PublicNetwork, string> = { testnet: "Stellar Testnet", public: "Stellar Public network" };

/** Stellar Expert transaction page for a hash on a network. Null when the hash is not 64 hex characters, so a malformed record never produces a link. */
export function explorerUrl(network: PublicNetwork, txHash: string): string | null {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return null;
  return `https://stellar.expert/explorer/${network === "testnet" ? "testnet" : "public"}/tx/${txHash.toLowerCase()}`;
}

const assetText = (a: PublicAsset) => a.code;

export interface SettlementTileView {
  identifier: string;
  title: string;
  amount: string;
  /** null unless both institutions opted in: nothing is said about who paid whom */
  parties: string | null;
  time: string;
  network: string;
  explorerHref: string | null;
  /** the verified mark, present only when the record carries a verified read-back */
  mark: string | null;
}

export function settlementView(s: PublicSettlement): SettlementTileView {
  return {
    identifier: middle(s.id, 8, 6),
    title: s.parties ? `${s.parties.payer.displayName} to ${s.parties.payee.displayName}` : "Settlement",
    amount: formatAmount(s.amount, assetText(s.asset)),
    parties: s.parties ? `${s.parties.payer.displayName} paid ${s.parties.payee.displayName}` : null,
    time: formatDateTime(s.settledAt),
    network: NETWORK_LABEL[s.network],
    explorerHref: explorerUrl(s.network, s.txHash),
    mark: verifiedMark(s.verifiedReadBack),
  };
}

export interface InstitutionTileView { identifier: string; title: string; chips: string[] }
/** Only fields the institution published. Absent fields produce no chip, never a placeholder. */
export function institutionView(i: PublicInstitution): InstitutionTileView {
  const chips: string[] = [];
  if (i.institutionType) chips.push(i.institutionType);
  if (i.jurisdiction) chips.push(i.jurisdiction);
  if (typeof i.settlementCount === "number") chips.push(`${i.settlementCount} settlement${i.settlementCount === 1 ? "" : "s"}`);
  if (i.optedInAt) chips.push(`Opted in ${formatDateTime(i.optedInAt)}`);
  return { identifier: middle(i.id, 8, 6), title: i.displayName, chips };
}
