# Database

PostgreSQL 16. All primary keys are UUIDs (`BaseModel`); all models have
`created_at`/`updated_at`. SQLite is used only for bare local dev/tests.

## Implemented (Phase 0)

### `branches.Branch`
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| name | varchar(200) | |
| slug | slug(80), unique | used in public URLs (`/filial/<slug>`) |
| address | varchar(300), blank | |
| telegram_chat_id | varchar(64), blank | optional Telegram chat for result messages; empty -> shared `TELEGRAM_CHAT_ID` (superadmin-managed, decision #34) |
| is_active | bool, default true | inactive branch: its staff can't log in / use the API (decision #12); hidden from the public picker |
| created_at / updated_at | timestamptz | |

### `accounts.User` (custom `AbstractUser`, login = username + password)
Extra fields: `id uuid`, `role` (`superadmin` / `admin` / `teacher`), `branch` FK -> Branch
(`PROTECT`, null allowed), `subjects` M2M -> Subject (Phase 1a, teachers only),
`created_at`, `updated_at`.

Invariant enforced by DB `CheckConstraint user_role_branch_consistent` AND `clean()`:
- `superadmin` -> `branch IS NULL`
- `admin`, `teacher` -> `branch IS NOT NULL`

`User.save()` derives `is_staff = is_superuser = (role == superadmin)`, so only superadmins
reach Django admin and can't be escalated by editing flags. `createsuperuser` yields
`role=superadmin`, no branch. Django sessions/axes tables come from their packages.
`User.is_operational` (property) = active AND (superadmin OR branch active).

Teacher -> subject assignment (`User.subjects`, reverse `Subject.teachers`) is only
meaningful for teachers, and only subjects of the teacher's own branch may be assigned
(enforced in the users API serializer, not by a DB constraint).

## Implemented (Phase 1a) - app `content`

```
Branch 1--* Subject 1--* Test 1--* Question 1--* Option
Branch 1--* MediaAsset  (Question.image, Option.image -> MediaAsset)
User(teacher) *--* Subject
```

### `content.Subject`
`branch` FK (PROTECT), `name` (200), `slug` (80), `description`, `is_active`.
Unique `(branch, slug)`.

### `content.MediaAsset`
`branch` FK (PROTECT), `file` (`uploads/<uuid>.<png|jpg|webp>`), `sha256` (of the
re-encoded bytes), `mime`, `width`, `height`, `size` (bytes), `uploaded_by` FK User
(SET_NULL). Unique `(branch, sha256)`.

### `content.Test`
| field | notes |
|---|---|
| subject | FK Subject (CASCADE) |
| branch | FK Branch (PROTECT), **denormalised**: set from `subject.branch` in `save()`, not editable, never taken from a client |
| author | FK User (SET_NULL) |
| title | varchar(250) |
| description_src / description_html | markdown source / sanitized html |
| status | `draft` (default) / `published` / `archived`; changed only by the publish/unpublish/archive actions. Only `published` is visible to students (Phase 2) |
| time_limit_sec | null = unlimited |
| pass_percent | 0..100 (CheckConstraint), default 60 |
| shuffle_questions, shuffle_options | bool |
| result_visibility | `none` / `score` (default) / `full` |
| max_attempts | null = unlimited |

### `content.Question`
`test` FK (CASCADE), `order`, `type` (`single` / `multiple` / `text`), `body_format`
(`md` / `html`), `body_src`, `body_html` (sanitized), `image` FK MediaAsset (SET_NULL),
`explanation` + `explanation_html`, `points` (>= 1 in the API). `text` exists in the model
as a reserved value; the API refuses to create it until Phase 6.

### `content.Option`
`question` FK (CASCADE), `order`, `text_src`, `text_html` (sanitized, in the question's
`body_format`), `image` FK MediaAsset (SET_NULL), `is_correct`. Count unlimited; the >= 2 /
correct-answer rules are enforced by services at publish time (no DB constraint, because
drafts may be incomplete).

`*_html` fields are written only by `save()` / the clone service through
`content.services.sanitize.render_rich`.

## Implemented (Phase 2) - app `attempts`

```
Test 1--* Attempt 1--* AttemptItem *--1 Question      (all PROTECT towards content)
Branch 1--* Attempt  (denormalised from test.branch, set in save())
```

### `attempts.Attempt`
`test` FK (PROTECT), `branch` FK (PROTECT, denormalised), `full_name` (60), `age`
(smallint), `access_token` (unique, `token_urlsafe(32)`), `device_id` (indexed; from the
`tp_device` cookie), `status` (`in_progress` / `finished` / `expired`), `started_at`,
`deadline_at` (null = unlimited), `finished_at`, `seed`, `pass_percent` (frozen at start),
`score`, `max_score`, `percent` (decimal 5,2), `passed` (null until closed), `ip`,
`user_agent`, `telegram_notified_at` (Phase 3: set once the Telegram message went out; idempotency guard). Constraint `one_active_attempt_per_device_test`: unique `(test, device_id)`
where `status='in_progress'`. Index `(test, device_id)`. Helper `attempts.scoping.attempts_for`.

### `attempts.AttemptItem`
`attempt` FK (CASCADE), `question` FK (PROTECT), `order` (1-based display position; unique
with attempt), `question_snapshot` (JSONB: type, points, body_html, image_url,
explanation_html, options[{id, text_html, image_url, is_correct}] in displayed order),
`selected_option_ids` (JSON list of option id strings), `is_correct`, `points_awarded`,
`answered_at`. `is_correct` inside the snapshot must never reach the public API while the
attempt runs (decision #23).

Migration: `attempts/0001_initial`.

## Planned (do NOT create before its phase)

- Telegram bot (Phase 5) adds phone -> name identification; nothing in Phase 0-4 depends on it.

Migrations: `make makemigrations` then `make migrate` (auto-run on container start too).
Current: `attempts/0001_initial`, `attempts/0002_attempt_telegram_notified_at`, `branches/0001`, `branches/0002_branch_telegram_chat_id`, `accounts/0001`, `content/0001`, `accounts/0002_user_subjects`.
