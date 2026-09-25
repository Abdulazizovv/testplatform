// Server-side session check (Server Components only). Forwards the browser's session
// cookie to Django over the internal compose network - never through the public origin.
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CurrentUser, Role } from "./types";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has("sessionid")) return null;

  const incoming = await headers();
  const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/me/`, {
    headers: {
      cookie: cookieStore.toString(),
      // Django (behind SECURE_PROXY_SSL_HEADER) would otherwise redirect this
      // plain-http internal call to https.
      "x-forwarded-proto": incoming.get("x-forwarded-proto") ?? "https",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Backend /auth/me/ javobi: ${res.status}`);
  return (await res.json()) as CurrentUser;
}

/** Redirects to /kirish without a session, and to /panel when the role may not open the page. */
export async function requireUser(allowed?: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/kirish");
  if (allowed && !allowed.includes(user.role)) redirect("/panel");
  return user;
}

/** Server-side GET against the backend with the visitor's session (for Server Components). */
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const incoming = await headers();
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, {
      headers: {
        cookie: cookieStore.toString(),
        "x-forwarded-proto": incoming.get("x-forwarded-proto") ?? "https",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
