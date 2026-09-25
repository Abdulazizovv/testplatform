// Server-side reads of the anonymous student API (Server Components only). Goes straight to
// Django over the compose network; no cookies are forwarded because nothing here is personal.
import "server-only";
import { headers } from "next/headers";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

async function fetchApi(path: string): Promise<Response> {
  const incoming = await headers();
  return fetch(`${API_INTERNAL_URL}${path}`, {
    headers: {
      accept: "application/json",
      // Django (behind SECURE_PROXY_SSL_HEADER) would otherwise redirect this plain-http call.
      "x-forwarded-proto": incoming.get("x-forwarded-proto") ?? "https",
    },
    cache: "no-store",
  });
}

/** null when the resource does not exist (404); throws on any other failure (-> error.tsx). */
export async function publicGet<T>(path: string): Promise<T | null> {
  const res = await fetchApi(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public API ${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** Every page of a paginated public list (page_size 100). */
export async function publicList<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetchApi(`${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=100`);
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Public API ${path}: ${res.status}`);
    const data = (await res.json()) as { results: T[]; next: string | null };
    out.push(...data.results);
    if (!data.next) break;
  }
  return out;
}
