// The client address as seen by the ONE trusted proxy hop in front of this service (0 or 1). With 1, the address that proxy appended (the LAST entry of
// X-Forwarded-For) is used; earlier entries are client-supplied and ignored. With 0 nothing forwarded is trusted and the result is null. A value that is
// not an IP address is rejected. Pure, so it is unit-tested. The same rule exists in the console (apps/web-console/lib/server/config.ts).
export function clientIpFromForwarded(forwardedFor: string | null, hops: number): string | null {
  if (hops !== 1 || !forwardedFor) return null;
  const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = parts[parts.length - 1];
  return ip && /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : null;
}
