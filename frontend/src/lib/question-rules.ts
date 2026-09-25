// Client-side mirror of backend/apps/content/services/validation.py (decision #16), used for
// live warnings while editing. The server stays the source of truth and re-validates.
import type { ApiError } from "./api";
import type { QuestionItem, QuestionType } from "./types";

export interface RuleInput {
  type: QuestionType | "text";
  bodySrc: string;
  hasImage: boolean;
  options: Array<{ text: string; hasImage: boolean; isCorrect: boolean }>;
}

export function questionProblems(q: RuleInput): string[] {
  const problems: string[] = [];
  if (!q.bodySrc.trim() && !q.hasImage) problems.push("Savol matni yoki rasmi bo'lishi shart.");
  if (q.options.length < 2) problems.push("Kamida 2 ta variant bo'lishi kerak.");
  q.options.forEach((o, i) => {
    if (!o.text.trim() && !o.hasImage) problems.push(`${i + 1}-variant bo'sh: matn yoki rasm kiriting.`);
  });
  const correct = q.options.filter((o) => o.isCorrect).length;
  if (q.type === "single" && correct !== 1) problems.push("Bitta javobli savolda aynan 1 ta to'g'ri variant bo'lishi kerak.");
  if (q.type === "multiple" && correct < 1) problems.push("Kamida 1 ta to'g'ri variant belgilang.");
  return problems;
}

export function problemsOfQuestion(q: QuestionItem): string[] {
  return questionProblems({
    type: q.type,
    bodySrc: q.body_src,
    hasImage: q.image !== null,
    options: q.options.map((o) => ({ text: o.text_src, hasImage: o.image !== null, isCorrect: o.is_correct })),
  });
}

export interface OptionFieldErrors {
  text?: string;
  image?: string;
  general?: string;
}

export interface QuestionErrors {
  general: string | null;
  body?: string;
  explanation?: string;
  points?: string;
  image?: string;
  type?: string;
  options: OptionFieldErrors[];
  optionsGeneral?: string;
  problems: string[];
}

function flat(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flat).filter(Boolean).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flat).filter(Boolean).join(" ");
  return "";
}

/** Maps a server error (DRF field errors or {"detail","errors"}) onto question form fields. */
export function mapQuestionError(e: ApiError): QuestionErrors {
  const body = e.body as Record<string, unknown>;
  const out: QuestionErrors = { general: null, options: [], problems: [] };

  if (Array.isArray(body.errors)) {
    for (const item of body.errors as Array<{ problems?: string[] }>) {
      if (item && Array.isArray(item.problems)) out.problems.push(...item.problems);
    }
  }

  const opts = body.options;
  if (Array.isArray(opts)) {
    opts.forEach((entry, i) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const rec = entry as Record<string, unknown>;
        out.options[i] = {
          text: flat(rec.text_src) || undefined,
          image: flat(rec.image) || undefined,
          general: flat(rec.non_field_errors) || flat(rec.is_correct) || flat(rec.id) || undefined,
        };
      } else if (typeof entry === "string") {
        out.options[i] = { general: entry };
      }
    });
    if (opts.every((x) => typeof x === "string")) out.optionsGeneral = flat(opts);
  } else if (opts) {
    out.optionsGeneral = flat(opts);
  }

  out.body = flat(body.body_src) || undefined;
  out.explanation = flat(body.explanation) || undefined;
  out.points = flat(body.points) || undefined;
  out.image = flat(body.image) || undefined;
  out.type = flat(body.type) || undefined;

  const handled = ["detail", "errors", "options", "body_src", "explanation", "points", "image", "type"];
  const extra = Object.entries(body)
    .filter(([k]) => !handled.includes(k))
    .map(([, v]) => flat(v))
    .filter(Boolean);
  const detail = typeof body.detail === "string" ? body.detail : "";
  const nothingMapped =
    !out.body && !out.explanation && !out.points && !out.image && !out.type && !out.optionsGeneral &&
    out.options.every((o) => !o || (!o.text && !o.image && !o.general));
  if (extra.length > 0) out.general = extra.join(" ");
  else if (detail) out.general = detail;
  else if (nothingMapped && out.problems.length === 0) out.general = e.message;
  return out;
}
