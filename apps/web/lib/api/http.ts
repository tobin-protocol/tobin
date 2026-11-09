// Browser-side fetch wrapper. Every call goes to THIS app's own /api proxy (app/api/[...path]/route.ts), never to the console directly.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      // POST carries the CSRF header the API proxy checks (lib/server/csrf.ts)
      headers: init.body !== undefined || init.method === "POST" ? { "content-type": "application/json", "x-tobin-request": "1" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : init.method === "POST" ? "{}" : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Tobin could not be reached. Check your connection and try again.");
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* an empty or non-JSON body */ }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, e.error ?? "ERROR", e.message ?? `The request failed (${res.status}).`);
  }
  return data as T;
}
