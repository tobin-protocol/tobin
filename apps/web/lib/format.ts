export const cn = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

/** Group a decimal-integer string with thousands separators without converting it to a float. */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)$/.exec(value);
  if (!m) return value;
  return (m[1] ?? "") + (m[2] as string).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Amounts are always shown with their asset code. A missing asset renders "No asset", never a bare number. */
export function formatAmount(value: string | null | undefined, asset: string | null | undefined): string {
  if (value == null || value === "") return "No data";
  return `${groupDigits(value)} ${asset && asset.length > 0 ? asset : "(no asset)"}`;
}

/** Truncate the middle of an identifier: GABCDE…X7Q2. */
export function middle(id: string, head = 6, tail = 4): string {
  return id.length > head + tail + 1 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "No data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No data";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d) + " UTC";
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const INSTITUTION_LABEL: Record<string, string> = {
  bank: "Bank",
  "payment-institution": "Payment institution",
  "broker-dealer": "Broker-dealer",
  fintech: "Fintech",
  "corporate-treasury": "Corporate treasury",
  other: "Other",
};

/** "obligation.created" becomes "Obligation created". The API reports activity kinds as dotted identifiers. */
export function humanizeKind(kind: string): string {
  const t = kind.replace(/[._-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Date only, UTC: "08 Nov 2026". For tight table columns; the full timestamp stays in the title. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "No data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No data";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(d);
}
