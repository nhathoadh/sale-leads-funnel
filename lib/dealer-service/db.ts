/**
 * HTTP transport for the dealer service (vucar-RDS-proxy).
 *
 * The dealer service is the ONLY host allowed to touch the DRM database. The
 * monolith reaches it over HTTP at DEALER_SERVICE_URL, authenticating with
 * `Authorization: Bearer <VUCAR_API_SECRET>` (the service accepts this and
 * X-API-Key against its own API_KEY env — configure them to the same value).
 *
 * This file used to expose a direct pg pool (`dealerQuery`/`getDealerPool`);
 * those are gone — all access now goes through the HTTP API so the monolith
 * never opens a DB connection.
 */

function baseUrl(): string {
  const url = process.env.DEALER_SERVICE_URL || process.env.DEALER_SERVICE_BASE_URL;
  if (!url) {
    throw new Error(
      "DEALER_SERVICE_URL is not set - the dealer-service HTTP client cannot start",
    );
  }
  return url.replace(/\/$/, "");
}

function authHeader(): Record<string, string> {
  // The dealer service has its OWN key (its API_KEY env). Prefer the dedicated
  // DEALER_SERVICE_API_KEY; fall back to the legacy shared VUCAR_API_SECRET so
  // nothing breaks if a deployment set them to the same value.
  const key = process.env.DEALER_SERVICE_API_KEY || process.env.VUCAR_API_SECRET || "";
  return { Authorization: `Bearer ${key}` };
}

export interface DealerFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

/** Core request helper: builds the URL, attaches auth, parses JSON, throws on non-2xx. */
export async function dealerFetch<T = any>(
  path: string,
  options: DealerFetchOptions = {},
): Promise<T> {
  const { method = "GET", query, body } = options;
  let url = baseUrl() + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const init: RequestInit = {
    method,
    headers: { ...authHeader(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    // Server-to-server call; never cache.
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`dealer-service ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const dealerGet = <T = any>(path: string, query?: DealerFetchOptions["query"]) =>
  dealerFetch<T>(path, { method: "GET", query });

export const dealerPost = <T = any>(path: string, body?: unknown) =>
  dealerFetch<T>(path, { method: "POST", body });
