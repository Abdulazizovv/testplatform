// Types mirror the backend staff API (docs/API.md).
export type Role = "superadmin" | "admin" | "teacher";

export interface BranchBrief {
  id: string;
  name: string;
  slug: string;
}
/** @deprecated kept for existing imports; same as BranchBrief */
export type Branch = BranchBrief;

export interface CurrentUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  branch: BranchBrief | null;
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Filial admini",
  teacher: "O'qituvchi",
};

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface BranchFull extends BranchBrief {
  address: string;
  is_active: boolean;
  /** Superadmin only (hidden from other roles by the API). */
  telegram_chat_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ManagedUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  branch: BranchBrief | null;
  subjects: string[];
  last_login: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  branch: BranchBrief;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  test_count: number;
  created_at: string;
  updated_at: string;
}

export type TestStatus = "draft" | "published" | "archived";
export type ResultVisibility = "none" | "score" | "full";

export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  draft: "Qoralama",
  published: "E'lon qilingan",
  archived: "Arxivlangan",
};

export const RESULT_VISIBILITY_LABELS: Record<ResultVisibility, string> = {
  none: "Natija ko'rsatilmaydi",
  score: "Faqat ball",
  full: "Ball va javoblar",
};

export interface TestItem {
  id: string;
  subject: string;
  subject_name: string;
  branch: string;
  author: string | null;
  author_name: string | null;
  title: string;
  description_src: string;
  description_html: string;
  status: TestStatus;
  time_limit_sec: number | null;
  pass_percent: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  result_visibility: ResultVisibility;
  max_attempts: number | null;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export type QuestionType = "single" | "multiple";
export type BodyFormat = "md" | "html";

export interface OptionItem {
  id: string;
  order: number;
  text_src: string;
  text_html: string;
  image: string | null;
  image_url: string | null;
  is_correct: boolean;
}

export interface QuestionItem {
  id: string;
  test: string;
  order: number;
  type: QuestionType | "text";
  body_format: BodyFormat;
  body_src: string;
  body_html: string;
  image: string | null;
  image_url: string | null;
  explanation: string;
  explanation_html: string;
  points: number;
  options: OptionItem[];
}

export interface MediaAsset {
  id: string;
  branch: string;
  url: string;
  mime: string;
  width: number;
  height: number;
  size: number;
  created_at: string;
}

export interface PublishProblem {
  question_id: string;
  number: number;
  problems: string[];
}

// --- Results (docs/API.md, Phase 3) ---
export type AttemptStatus = "in_progress" | "finished" | "expired";

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  in_progress: "Davom etmoqda",
  finished: "Yakunlangan",
  expired: "Vaqti tugagan",
};

export interface ResultRow {
  id: string;
  full_name: string;
  age: number;
  test: { id: string; title: string };
  subject: { id: string; name: string };
  branch: { id: string; name: string };
  status: AttemptStatus;
  score: number | null;
  max_score: number | null;
  percent: string | null;
  passed: boolean | null;
  pass_percent: number;
  started_at: string;
  finished_at: string | null;
  duration_sec: number | null;
}

export interface ResultSummary {
  attempts: number;
  avg_percent: number | null;
  pass_rate: number | null;
}

export interface ResultList extends Paginated<ResultRow> {
  summary: ResultSummary;
}

export interface ResultOption {
  id: string;
  text_html: string;
  image_url: string | null;
  is_correct: boolean;
  selected: boolean;
}

export interface ResultItem {
  order: number;
  type: "single" | "multiple";
  points: number;
  points_awarded: number;
  answered: boolean;
  is_correct: boolean | null;
  body_html: string;
  image_url: string | null;
  explanation_html: string;
  options: ResultOption[];
}

export interface ResultDetail extends ResultRow {
  items: ResultItem[];
}

export interface QuestionAnalysis {
  question_id: string;
  order: number;
  type: "single" | "multiple";
  body_html: string;
  image_url: string | null;
  answered_count: number;
  correct_count: number;
  correct_percent: number;
  top_wrong_option: { option_id: string; text_html: string; image_url: string | null; count: number } | null;
}

export interface TestResultSummary extends ResultSummary {
  test: { id: string; title: string; subject: string };
  questions: QuestionAnalysis[];
}
