/**
 * Minimal HTTP helper shared by PSP adapters. `fetchImpl` is injectable so the
 * adapters can be unit-tested without network access.
 */

export type FetchImpl = typeof fetch;

export interface HttpResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T;
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Abort the request after this many ms (default 20s). */
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}

export async function httpJson<T = Record<string, unknown>>(
  req: HttpRequest,
): Promise<HttpResult<T>> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 20_000);

  try {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(req.headers ?? {}),
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });

    let body: T;
    const text = await res.text();
    try {
      body = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      body = { raw: text } as unknown as T;
    }

    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
