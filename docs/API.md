# API

Base path `/api/v1/`. JSON only. Same origin as the frontend (no CORS). Session cookie
auth + CSRF. Default permission: `IsAuthenticated`. Lists are paginated
(`{count, next, previous, results}`, `?page=`, `?page_size=` max 100).

Error bodies the UI shows are Uzbek: `{"detail": "..."}`.

## Implemented (Phase 0)

### `GET /api/v1/auth/csrf/`  (public)
Sets the `csrftoken` cookie; returns `{"csrfToken": "..."}`. Call before login/logout;
send the value as `X-CSRFToken`.

### `POST /api/v1/auth/login/`  (public, CSRF, throttled 10/min + axes lockout)
Body `{"username", "password"}`.
- `200` -> current user (below), sets `sessionid` (HttpOnly).
- `400` generic "Login yoki parol noto'g'ri." (same for unknown user, wrong password,
  inactive user) or missing fields.
- `403` CSRF failure. `429` throttled or locked out (5 failures / 15 min per username+IP).

### `POST /api/v1/auth/logout/`  (CSRF)
`204`, session destroyed.

### `GET /api/v1/auth/me/`  (authenticated)
```json
{"id": "uuid", "username": "teach1", "first_name": "", "last_name": "",
 "role": "superadmin|admin|teacher", "branch": {"id": "uuid", "name": "", "slug": ""} | null}
```
`403` when not logged in.

### `GET /healthz/`  (backend, no auth, no DB) -> `{"ok": true}`
Frontend has its own `GET /healthz` (no trailing slash).

There is deliberately **no registration endpoint**.

Phase 1a additions to auth: login of a non-superadmin whose branch is inactive -> `400`
"Filialingiz faol emas. Administrator bilan bog'laning."; an existing session of such a user
gets `403` from `/auth/me/` and every other endpoint (decision #12).

## Implemented (Phase 1a) - staff API (backend only; no UI yet)

All endpoints need a logged-in staff user (session + `X-CSRFToken` on writes), are scoped by
`scope_for`, and list endpoints are paginated. Objects outside the caller's scope answer
`404` (never `403`), so ids of other branches are not revealed. Validation errors are DRF
field errors (`{"field": ["..."]}`); business-rule errors are
`{"detail": "...", "errors": [...]}` (`400`, `409` for "has dependents"). `branch` is never
read from the body except where stated (superadmin creating a subject/user/media).

Role legend: **SA** superadmin, **A** branch admin (own branch), **T** teacher
(assigned subjects only).

### Branches - `/branches/`
| method | path | who |
|---|---|---|
| GET | `/branches/`, `/branches/{id}/` | SA all; A/T only their own |
| POST / PATCH / PUT / DELETE | `/branches/`, `/branches/{id}/` | SA only. DELETE -> `409` if the branch still has users/content |

Fields: `id, name, slug (unique), address, is_active, created_at, updated_at`.

### Users - `/users/` (SA, A only; teachers get 403)
| method | path | notes |
|---|---|---|
| GET | `/users/?role=&is_active=&search=` | SA: all. A: own branch (teachers + admins, including self). Superadmins are invisible to A |
| POST | `/users/` | body `username, password, role, first_name, last_name, subjects[]`. A: branch is forced to own; `role=superadmin` -> `403`. SA: also `branch_id` (required unless `role=superadmin`) |
| GET / PATCH / PUT | `/users/{id}/` | `password` optional on update. Branch can't be changed. Nobody can change their own role or deactivate themselves (`403`/`400`). Role can't become/stop being `superadmin` through the API. Changing role away from teacher clears `subjects` |
| DELETE | `/users/{id}/` | **deactivates** (`is_active=false`), `204`; can't deactivate yourself. Re-activate with `PATCH {"is_active": true}` |

`subjects` (list of subject ids) is teacher-only and must belong to the user's branch.
Read shape: `{id, username, first_name, last_name, role, is_active, branch{id,name,slug}|null,
subjects[ids], last_login, created_at}`. Passwords are validated with Django's validators
(min 10 chars, not common/numeric) and never returned.

### Subjects - `/subjects/`
| method | path | who |
|---|---|---|
| GET | `/subjects/?branch=&is_active=`, `/subjects/{id}/` | SA all; A own branch; T only assigned subjects |
| POST | `/subjects/` | SA (needs `branch_id`), A (branch forced to own). `slug` optional, auto-generated, unique per branch |
| PATCH / PUT | `/subjects/{id}/` | SA, A. Branch is immutable |
| DELETE | `/subjects/{id}/` | SA, A. `409` if the subject has tests |
| POST | `/subjects/{id}/clone/` | body `{"target_branch": uuid, "name"?}`. SA: any branch. A: only their own branch (a plain copy); another branch -> `403` (decision #14). Deep copy as drafts (tests, questions, options, media), one transaction. Returns the new subject `201` |

Fields: `id, branch{id,name,slug}, name, slug, description, is_active, test_count, created_at,
updated_at`.

### Tests - `/tests/` (SA, A: whole branch; T: all tests of assigned subjects - decision #13)
| method | path | notes |
|---|---|---|
| GET | `/tests/?subject=&status=&search=` , `/tests/{id}/` | list rows and detail have the same shape (no questions embedded) |
| POST | `/tests/` | `subject` must be one the caller may use. `branch` and `author` are set server-side, `status` starts as `draft` |
| PATCH / PUT | `/tests/{id}/` | can move to another subject of the same branch that the caller may use |
| DELETE | `/tests/{id}/` | T only own tests (else `403`); published tests can't be deleted (`400`) |
| POST | `/tests/{id}/publish/` | validates every question (decision #16). Failure: `400 {"detail", "errors": [{"question_id", "number", "problems": [...]}]}` |
| POST | `/tests/{id}/unpublish/` | published -> draft |
| POST | `/tests/{id}/archive/` | any -> archived |
| POST | `/tests/{id}/duplicate/` | body `{"subject"?, "title"?}`; copy as draft (author = caller) in the same or another allowed subject of the SAME branch |
| GET | `/tests/{id}/questions/` | paginated questions with options, ordered |
| POST | `/tests/{id}/questions/` | create a question (below) |
| POST | `/tests/{id}/questions/reorder/` | `{"order": [question ids]}` = exactly all questions of the test; `204` |

Test fields: `id, subject, subject_name, branch, author, author_name, title, description_src,
description_html, status, time_limit_sec (null = unlimited, >= 1), pass_percent (0-100),
shuffle_questions, shuffle_options, result_visibility (none|score|full), max_attempts (null
= unlimited, >= 1), question_count, created_at, updated_at`.

### Questions - `/questions/{id}/` (GET, PATCH, PUT, DELETE)
Questions and options are **one nested payload** (decision #15). There are no separate
option endpoints.

```json
{
  "type": "single | multiple",          // "text" -> 400 "Yoziladigan savollar keyingi bosqichda."
  "body_format": "md | html",
  "body_src": "2 + 2 = ?",
  "image": "<media id> | null",
  "explanation": "",
  "points": 1,
  "options": [                           // ordered; unlimited count
    {"id": "<existing option id, optional>", "text_src": "4", "image": null, "is_correct": true},
    {"text_src": "5", "is_correct": false}
  ]
}
```
On `PATCH`, if `options` is sent it is the full list: entries with `id` are updated, entries
without are created, omitted options are deleted; an `id` of another question's option is
`400`. Response adds `id, test, order, body_html, explanation_html, image_url` and, per
option, `id, order, text_html, image_url`. `is_correct` is included: **this is the staff
API - the future public/student API must not expose it** (decision #20).
A draft test accepts incomplete questions; in a published test every save is fully validated
and rolled back on failure. Deleting the last question of a published test is refused; deleting a question (or a test) that has student attempts is `409` (decision #25).
`image` ids and `/media/...` URLs inside `*_src` must belong to the test's branch.

### Media - `/media/` (SA, A, T)
| method | path | notes |
|---|---|---|
| POST | `/media/` | `multipart/form-data`, field `file` (+ `branch_id` for SA only). JPEG/PNG/WebP by magic bytes, <= 5 MB, <= 4096 px per side, re-encoded (metadata stripped). `201` new / `200` if the same content already exists in the branch. Response `{id, branch, url, mime, width, height, size, created_at}` |
| GET | `/media/`, `/media/{id}/` | own branch only |

`url` (e.g. `/media/uploads/<uuid>.png`) is served by nginx and is what goes into `img` tags
and markdown (`![alt](url)`).

## Implemented (Phase 2) - public student API (anonymous)

All under `/api/v1/public/`, no login, no CSRF (decision #21), JSON, lists paginated. Errors
are `{"detail": "<Uzbek>"}`; unknown/hidden things are `404`. Throttled (`429`), decision #29.
**Nothing here ever returns `is_correct`/`explanation` while an attempt is in progress.**
Attempt responses are `Cache-Control: no-store`.

| method | path | notes |
|---|---|---|
| GET | `/public/branches/` | active branches: `{id, slug, name, address}` |
| GET | `/public/branches/{slug}/` | one branch |
| GET | `/public/branches/{slug}/subjects/` | active subjects with >= 1 published test: `{id, slug, name, description, test_count}` |
| GET | `/public/branches/{slug}/subjects/{subject_slug}/` | subject + `branch` |
| GET | `/public/subjects/{id}/tests/` | published tests: `{id, title, description_html, question_count, time_limit_sec, pass_percent}` |
| GET | `/public/tests/{id}/` | same + `subject`, `branch` |
| POST | `/public/tests/{id}/attempts/` | body `{full_name, age}`; `201` new / `200` resumed (same device, same name); `400` field errors; `403` max_attempts used; `404` not public; `409` other unfinished attempt on this device (`errors[0].access_token`). Sets `tp_device` cookie |
| GET | `/public/attempts/{token}/` | state: `status, full_name, age, test, started_at, deadline_at, server_time, remaining_sec` + (in progress only) `items[{id, order, type, points, body_html, image_url, options[{id, text_html, image_url}], selected_option_ids, answered}]`, `question_count, answered_count` |
| POST/PUT | `/public/attempts/{token}/answers/` | `{item_id or question_order, selected_option_ids[]}` (empty = clear); idempotent; returns `{saved, item_id, order, selected_option_ids, answered_count, remaining_sec, server_time}`. `400` foreign/duplicate option or 2 options on single; `404` unknown item; `410` deadline passed (attempt becomes `expired`); `409` already finished |
| POST | `/public/attempts/{token}/finish/` | grades; idempotent; returns the result payload below |
| GET | `/public/attempts/{token}/result/` | `409` while in progress. Payload depends on the test's `result_visibility`: `none` -> `{status, test, full_name, started_at, finished_at, result_visibility}`; `score` -> + `score, max_score, percent, passed, pass_percent`; `full` -> + `items[{order, type, points, points_awarded, answered, is_correct, body_html, image_url, explanation_html, options[{id, text_html, image_url, is_correct, selected}]}]` |

Attempt `status`: `in_progress`, `finished`, `expired` (time ran out; graded from saved answers).

## Planned

- Phase 3: results lists + export. Phase 4: import.
