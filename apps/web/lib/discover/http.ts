// The HTTP DiscoverClient: GET /api/public/v1/* through this app's own proxy. Pure mapping (`fetchImpl` is injectable) so it is unit-tested.
// Rules: a value the API returns as null stays null (the screen says "No data", never 0); a malformed body is an error, not an empty list; nothing is invented.
import type { AssetSort, DiscoverClient, DiscoverResult, InstitutionSort, ListQuery, Page, ProtocolStats, PublicAssetUse, PublicInstitution, PublicSettlement, SettlementSort } from "./types.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === "string" && x !== "" ? x : undefined);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

export const PAGE_LIMIT = 20;

export function mapStats(b: unknown): ProtocolStats | null {
  if (!isObj(b)) return null;
  const note = str(b.note);
  return { settlementsRecorded: numOrNull(b.settlementsRecorded), institutionsOptedIn: numOrNull(b.institutionsOptedIn), assetsInUse: numOrNull(b.assetsInUse), lastSettlementAt: str(b.lastSettlementAt) ?? null, ...(note ? { note } : {}) };
}

export function mapInstitution(x: unknown): PublicInstitution | null {
  if (!isObj(x)) return null;
  const id = str(x.id), displayName = str(x.displayName);
  if (!id || !displayName) return null;
  const type = str(x.institutionType), jurisdiction = str(x.jurisdiction), optedInAt = str(x.optedInAt);
  return { id, displayName, ...(type ? { institutionType: type } : {}), ...(jurisdiction ? { jurisdiction } : {}), ...(optedInAt ? { optedInAt } : {}), ...(typeof x.settlementCount === "number" ? { settlementCount: x.settlementCount } : {}) };
}

const asset = (x: unknown) => (isObj(x) && str(x.code) ? { code: str(x.code)!, issuer: str(x.issuer) ?? null } : null);
const party = (q: unknown) => (isObj(q) && str(q.institutionId) && str(q.displayName) ? { institutionId: str(q.institutionId)!, displayName: str(q.displayName)! } : null);

export function mapSettlement(x: unknown): PublicSettlement | null {
  if (!isObj(x)) return null;
  const a = asset(x.asset), id = str(x.id), amount = str(x.amount), settledAt = str(x.settledAt), txHash = str(x.txHash);
  if (!a || !id || !amount || !settledAt || !txHash) return null;
  const payer = isObj(x.parties) ? party(x.parties.payer) : null;
  const payee = isObj(x.parties) ? party(x.parties.payee) : null;
  return { id, asset: a, amount, settledAt, txHash, network: x.network === "public" ? "public" : "testnet", verifiedReadBack: x.verifiedReadBack === true, parties: payer && payee ? { payer, payee } : null };
}

export function mapAssetUse(x: unknown): PublicAssetUse | null {
  if (!isObj(x)) return null;
  const a = asset(x.asset), settledAmount = str(x.settledAmount), lastSettledAt = str(x.lastSettledAt);
  if (!a || !settledAmount || !lastSettledAt || typeof x.settlementCount !== "number") return null;
  return { asset: a, settlementCount: x.settlementCount, settledAmount, lastSettledAt };
}

export function mapPage<T>(b: unknown, item: (x: unknown) => T | null): Page<T> | null {
  if (!isObj(b) || !Array.isArray(b.items)) return null;
  const items = b.items.map(item);
  if (items.some((i) => i === null)) return null;
  const note = str(b.note);
  return { items: items as T[], nextCursor: str(b.nextCursor) ?? null, total: numOrNull(b.total), ...(note ? { note } : {}) };
}

export function createHttpClient(fetchImpl: Fetch = (i, init) => fetch(i, init)): DiscoverClient {
  async function get<T>(path: string, query: Record<string, string | number | undefined>, map: (b: unknown) => T | null): Promise<DiscoverResult<T>> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
    const qs = q.toString();
    const url = `/api/public/v1/${path}${qs ? `?${qs}` : ""}`;
    let res: Response;
    try { res = await fetchImpl(url, { method: "GET", credentials: "same-origin" }); } catch { return { kind: "error", message: "Tobin could not be reached. Check your connection and try again." }; }
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) return { kind: "error", message: (isObj(body) && str(body.message)) || `The request failed (${res.status}).` };
    const data = map(body);
    return data === null ? { kind: "error", message: "The server sent a response Tobin could not read." } : { kind: "ok", data };
  }
  const list = <S extends string, T>(path: string, item: (x: unknown) => T | null) => (q: ListQuery<S>) => get(path, { sort: q.sort, cursor: q.cursor, limit: q.limit ?? PAGE_LIMIT }, (b) => mapPage(b, item));
  return {
    stats: () => get("stats", {}, mapStats),
    settlements: list<SettlementSort, PublicSettlement>("settlements", mapSettlement),
    institutions: list<InstitutionSort, PublicInstitution>("institutions", mapInstitution),
    assets: list<AssetSort, PublicAssetUse>("assets", mapAssetUse),
  };
}
