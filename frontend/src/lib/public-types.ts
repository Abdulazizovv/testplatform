// Types mirror the anonymous student API (docs/API.md, "Phase 2").
export interface PublicBranch {
  id: string;
  slug: string;
  name: string;
  address: string;
}

export interface PublicSubject {
  id: string;
  slug: string;
  name: string;
  description: string;
  test_count: number;
}

export interface PublicTest {
  id: string;
  title: string;
  description_html: string;
  question_count: number;
  time_limit_sec: number | null;
  pass_percent: number;
}

export interface PublicTestDetail extends PublicTest {
  subject: PublicSubject;
  branch: PublicBranch;
}

export interface PublicSubjectDetail extends PublicSubject {
  branch: PublicBranch;
}

export interface AttemptOption {
  id: string;
  text_html: string;
  image_url: string | null;
}

export interface AttemptItem {
  id: string;
  order: number;
  type: "single" | "multiple";
  points: number;
  body_html: string;
  image_url: string | null;
  options: AttemptOption[];
  selected_option_ids: string[];
  answered: boolean;
}

export type AttemptStatus = "in_progress" | "finished" | "expired";

export interface AttemptState {
  access_token: string;
  status: AttemptStatus;
  full_name: string;
  age: number;
  test: { id: string; title: string; time_limit_sec: number | null };
  started_at: string;
  deadline_at: string | null;
  server_time: string;
  /** Seconds left according to the SERVER clock at response time; null = unlimited. */
  remaining_sec: number | null;
  items?: AttemptItem[];
  question_count?: number;
  answered_count?: number;
  resumed?: boolean;
}

export interface AnswerSaved {
  saved: true;
  item_id: string;
  order: number;
  selected_option_ids: string[];
  answered_count: number;
  remaining_sec: number | null;
}

export interface ReviewOption {
  id: string;
  text_html: string;
  image_url: string | null;
  is_correct: boolean;
  selected: boolean;
}

export interface ReviewItem {
  order: number;
  type: "single" | "multiple";
  points: number;
  points_awarded: number;
  answered: boolean;
  is_correct: boolean;
  body_html: string;
  image_url: string | null;
  explanation_html: string;
  options: ReviewOption[];
}

export type ResultVisibility = "none" | "score" | "full";

export interface AttemptResult {
  status: "finished" | "expired";
  test: { id: string; title: string };
  full_name: string;
  started_at: string;
  finished_at: string | null;
  result_visibility: ResultVisibility;
  score?: number;
  max_score?: number;
  percent?: number;
  passed?: boolean;
  pass_percent?: number;
  items?: ReviewItem[];
}
