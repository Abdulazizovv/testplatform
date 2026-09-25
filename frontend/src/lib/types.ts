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
