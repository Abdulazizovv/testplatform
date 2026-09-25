// Browser client for the anonymous student API. Deliberately separate from lib/api.ts:
// there is no session and no CSRF here (the attempt token is the credential), and a 403 must
// never be read as "staff session ended".
import { ApiError, type ApiErrorBody } from "./api";
import type { AnswerSaved, AttemptResult, AttemptState } from "./public-types";

const BASE = "/api/v1/public";

const MESSAGES: Record<number, string> = {
  400: "Ma'lumotlarni tekshirib, qayta urinib ko'ring.",
  403: "Bu amalni bajarishga ruxsat yo'q.",
  404: "Topilmadi. Havola noto'g'ri yoki eskirgan bo'lishi mumkin.",
  409: "Amalni bajarib bo'lmadi.",
  410: "Test vaqti tugagan.",
  429: "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring.",
};
const NETWORK = "Server bilan aloqa o'rnatib bo'lmadi. Internetni tekshiring.";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "same-origin", // carries the anonymous device cookie (max_attempts)
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK);
  }
  if (res.ok) return (await res.json()) as T;
  let data: ApiErrorBody = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as ApiErrorBody;
  } catch {
    /* non-JSON error page (e.g. nginx 429/502) */
  }
  const message =
    (typeof data.detail === "string" && data.detail) ||
    MESSAGES[res.status] ||
    (res.status >= 500 ? "Serverda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring." : "Xatolik yuz berdi.");
  throw new ApiError(res.status, res.status === 429 && !data.detail ? MESSAGES[429] : message, data);
}

export const startAttempt = (testId: string, fullName: string, age: number) =>
  call<AttemptState>("POST", `/tests/${testId}/attempts/`, { full_name: fullName, age });

export const getAttempt = (token: string) => call<AttemptState>("GET", `/attempts/${token}/`);

export const saveAnswer = (token: string, itemId: string, selected: string[]) =>
  call<AnswerSaved>("POST", `/attempts/${token}/answers/`, { item_id: itemId, selected_option_ids: selected });

export const finishAttempt = (token: string) => call<AttemptResult>("POST", `/attempts/${token}/finish/`);

export const getResult = (token: string) => call<AttemptResult>("GET", `/attempts/${token}/result/`);

/** Whether a failed call is worth retrying automatically (network trouble, throttling, 5xx). */
export function isTransient(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);
}

// Active attempt per test, so the test page can offer "continue" (the token is also in the URL).
const key = (testId: string) => `tp:attempt:${testId}`;
export function rememberAttempt(testId: string, token: string) {
  try {
    window.localStorage.setItem(key(testId), token);
  } catch {
    /* storage may be blocked; the URL still carries the token */
  }
}
export function recallAttempt(testId: string): string | null {
  try {
    return window.localStorage.getItem(key(testId));
  } catch {
    return null;
  }
}
export function forgetAttempt(testId: string) {
  try {
    window.localStorage.removeItem(key(testId));
  } catch {
    /* ignore */
  }
}
