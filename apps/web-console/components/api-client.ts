// Browser-side fetch helper for the institutional pages. Authentication is the HttpOnly session cookie (sent automatically); nothing here ever holds or
// sends an identity. Non-GET requests carry the x-tobin-request header the server requires.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-tobin-request'] = '1';
  const res = await fetch(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({ message: 'unreadable response' }))) as T & { message?: string; error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? `request failed (${res.status})`);
  return data;
}
