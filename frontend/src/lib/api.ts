// Browser-side API client (central fetch wrapper). Same origin: nginx serves the frontend
// and /api/* together, so URLs are relative and no domain is ever configured here.
//
// - Session cookie auth + CSRF: the token from /auth/csrf/ is cached and sent as
//   X-CSRFToken on every write; a CSRF failure refreshes it and retries once.
// - DRF answers 403 both for "not logged in" and "not allowed", so on a 403 the wrapper asks
//   /auth/me/: if that fails too the session is gone and the user is sent to /kirish.
// - Errors become ApiError with the Uzbek message, field errors and business `errors`.
import type { CurrentUser, MediaAsset } from "./types";

export interface ApiErrorBody {
  detail?: string;
  errors?: unknown[];
  [field: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: ApiErrorBody = {},
  ) {
    super(message);
  }

  /** Top-level DRF field errors flattened to strings: {"username": ["..."]} -> {username: "..."}. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.body)) {
      if (key === "detail" || key === "errors") continue;
      const text = flattenMessages(value);
      if (text) out[key] = text;
    }
    return out;
  }
}

function flattenMessages(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenMessages).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(flattenMessages).filter(Boolean).join(" ");
  }
  return "";
}

const NETWORK_ERROR = "Server bilan aloqa o'rnatib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.";
const SESSION_ENDED = "Sessiya tugadi. Qaytadan kiring.";

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Ma'lumotlarni tekshirib, qayta urinib ko'ring.",
  403: "Bu amalni bajarishga ruxsatingiz yo'q.",
  404: "Ma'lumot topilmadi. U o'chirilgan yoki sizga ochiq emas bo'lishi mumkin.",
  409: "Amalni bajarib bo'lmadi: bog'liq ma'lumotlar mavjud.",
  413: "Fayl juda katta.",
  429: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.",
};

let csrfToken: string | null = null;

async function getCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  const res = await fetch("/api/v1/auth/csrf/", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, NETWORK_ERROR);
  csrfToken = ((await res.json()) as { csrfToken: string }).csrfToken;
  return csrfToken;
}

let redirecting = false;
function endSession(): never {
  if (typeof window !== "undefined" && !redirecting) {
    redirecting = true;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/kirish"; // hard navigation drops all client state
  }
  throw new ApiError(401, SESSION_ENDED);
}

async function sessionAlive(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/auth/me/", { credentials: "same-origin", cache: "no-store" });
    return res.ok;
  } catch {
    return true; // network trouble is not proof of an ended session
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  body?: unknown;
  form?: FormData;
  query?: Query;
  /** false for login/logout: a 403 there is not a "session ended" signal. */
  guardSession?: boolean;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

async function send(method: string, url: string, opts: RequestOptions, retried = false): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, credentials: "same-origin", headers, cache: "no-store" };
  if (method !== "GET") {
    headers["X-CSRFToken"] = await getCsrfToken(retried);
    if (opts.form) {
      init.body = opts.form; // the browser sets the multipart boundary
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
  }
  const res = await fetch(url, init);
  if (res.status === 403 && method !== "GET" && !retried) {
    const text = await res.clone().text();
    if (/csrf/i.test(text) || !text.trim().startsWith("{")) return send(method, url, opts, true);
  }
  return res;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && !Array.isArray(data)) body = data as ApiErrorBody;
  } catch {
    /* non-JSON body */
  }
  const message =
    (typeof body.detail === "string" && body.detail) ||
    DEFAULT_MESSAGES[res.status] ||
    (res.status >= 500 ? "Serverda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring." : "Xatolik yuz berdi.");
  return new ApiError(res.status, message, body);
}

export async function request<T = void>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = withQuery(path, opts.query);
  let res: Response;
  try {
    res = await send(method, url, opts);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  if (opts.guardSession !== false && (res.status === 401 || (res.status === 403 && !(await sessionAlive())))) {
    endSession();
  }
  throw await parseError(res);
}

export const apiGet = <T>(path: string, query?: Query) => request<T>("GET", path, { query });
export const apiPost = <T = void>(path: string, body?: unknown) => request<T>("POST", path, { body });
export const apiPatch = <T>(path: string, body: unknown) => request<T>("PATCH", path, { body });
export const apiDelete = (path: string) => request<void>("DELETE", path);

export function uploadImage(file: File, branchId?: string): Promise<MediaAsset> {
  const form = new FormData();
  form.append("file", file);
  if (branchId) form.append("branch_id", branchId);
  return request<MediaAsset>("POST", "/api/v1/media/", { form });
}

/** Loads every page of a paginated endpoint (page_size 100). */
export async function apiGetAll<T>(path: string, query: Query = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const data = await apiGet<{ results: T[]; next: string | null }>(path, { ...query, page, page_size: 100 });
    out.push(...data.results);
    if (!data.next) return out;
  }
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  try {
    return await request<CurrentUser>("POST", "/api/v1/auth/login/", {
      body: { username, password },
      guardSession: false,
    });
  } catch (e) {
    if (e instanceof ApiError && !e.body.detail) {
      throw new ApiError(e.status, e.status === 429 ? DEFAULT_MESSAGES[429] : "Kirishda xatolik yuz berdi. Qayta urinib ko'ring.", e.body);
    }
    throw e;
  }
}

export async function logout(): Promise<void> {
  await request("POST", "/api/v1/auth/logout/", { guardSession: false });
  csrfToken = null;
}

/** Splits an error into per-field messages and one general message for form display. */
export function formErrors(e: unknown): { fields: Record<string, string>; general: string | null } {
  if (e instanceof ApiError) {
    const fields = e.fields;
    return { fields, general: Object.keys(fields).length === 0 ? e.message : null };
  }
  return { fields: {}, general: e instanceof Error ? e.message : "Xatolik yuz berdi." };
}
