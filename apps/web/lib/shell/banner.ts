/** The grain banner's headline: a REAL count, or NO DATA when the count is unavailable (never a 0 that was not read). */
export function bannerHeadline(label: string, count: number | null | undefined): string {
  return `${label}: ${typeof count === "number" ? count : "NO DATA"}`;
}
