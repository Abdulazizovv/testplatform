# Decisions

Numbered, append-only. If a decision changes, add a new entry that supersedes the old one.

**#1 - Modular monolith** (Django + Next.js). No microservices.

**#2 - Cookie-session auth, not JWT.** Frontend and API share one origin (nginx), so Django
sessions + CSRF are simpler and safer (HttpOnly cookie, no token storage in JS). No CORS.

**#3 - Login + password only, no self-registration.** Superadmin (the developer) creates
superadmins/admins/teachers via Django admin; from Phase 1 a branch admin creates teachers
and admins **only in their own branch**.

**#4 - Roles: `superadmin`, `admin`, `teacher`.** Superadmin has no branch; admin/teacher
must have one (DB CheckConstraint + `clean()`). `is_staff`/`is_superuser` derive from role.

**#5 - Centralised scoping (`scope_for`) + permission classes** instead of per-view filters.
Branch leaks are the biggest risk of a multi-branch system, so one audited function decides
row visibility, and every branch-owned model gets a cross-branch test.

**#6 - Login brute-force protection: django-axes + nginx limit_req + DRF throttle.** axes
(DB handler) gives persistent lockouts per username+IP; nginx and DRF give cheap
volumetric limits. Chosen over a hand-rolled Redis throttle because lockout-with-cooloff and
audit records come for free.

**#7 - TLS/domain outside the repo.** Host nginx terminates TLS; the compose nginx only
routes and binds `127.0.0.1:${NGINX_PORT:-7788}`. The production domain is undecided and is
never hardcoded - only `.env` placeholders. `DJANGO_SECURE_SSL=False` exists solely to test
the stack over plain http locally.

**#8 - Frontend has no build-time public URL.** Browser calls use relative `/api/...`;
server-side calls use `API_INTERNAL_URL=http://backend:8000`. One image works in every
environment.

**#9 - Celery worker now, beat later.** Worker runs from Phase 0 (wired + health-checked,
no tasks yet); celery-beat is added when the first periodic job (e.g. expiring attempts)
exists. Celery sits on the internal network only.

**#10 - Django 6.1 / latest verified packages.** Versions pinned in
`backend/requirements.txt` after checking availability on PyPI (2026-09-25) and running
`pip check` + tests. Frontend: Next 16.3.6, React 19.3, Tailwind 4.3.3, TypeScript 5
(TypeScript 7 is available but not adopted: tooling like eslint-config-next is not yet
validated against it), ESLint 9 (v10 not adopted for the same reason).

**#11 - UUID primary keys** for all domain models (safe to expose in URLs/tokens).

## Phase 1a decisions (implemented)

**#12 - Inactive branch = no access.** `User.is_operational` = active account AND
(superadmin OR branch is active). Login refuses such users ("Filialingiz faol emas..."), and
because `scope_for` and every role permission class check `is_operational`, an already open
session is rejected on its next request (`/auth/me/` -> 403, every other API too).
Superadmin is exempt. Re-activating the branch restores access without a new login.
(Closes the open question below.)

**#13 - Teacher scope = the subject, not the author.** A teacher sees and edits EVERY test of
the subjects assigned to them (colleagues' tests included: assignment is per subject and
tests are shared teaching material). Exception: a teacher deletes only tests they authored;
admins/superadmin delete any. Teachers never create/edit subjects, users or branches, and
can't move a test into a subject that isn't theirs.

**#14 - Cross-branch subject copy is superadmin-only.** `POST /subjects/{id}/clone/`:
superadmin may clone any subject into any branch; a branch admin may only clone a subject of
their own branch into their OWN branch (a plain duplicate); naming another branch is 403.
Reason: a cross-branch copy puts content (and media) into a branch the admin can't see or
audit. The copy is all drafts, authored by the caller, without teacher assignments, in ONE DB
transaction; media files copied for the target branch are deleted again if it fails.

**#15 - Question + options are one nested payload.** Editing a question is one `POST/PATCH`
with `options: [...]` (ordered list; items with `id` are updated, without `id` created,
missing ones deleted). Simpler for the editor than three endpoints, and atomic; option ids
stay stable across edits (Phase 2 attempts will reference them). No standalone option
endpoints. Question list/create live under `/tests/{id}/questions/` (paginated); the test
detail does not embed questions.

**#16 - Draft is lenient, publish is strict.** Draft tests accept incomplete questions (0-1
options, no correct option, empty option, ...). `publish` - and any question save into an
already published test - requires: >= 1 question; each question has text or image; >= 2
options, each with text or image; `single` exactly 1 correct, `multiple` >= 1 correct. The
number of options is unlimited. `text` type is reserved: the API refuses to create it
("Yoziladigan savollar keyingi bosqichda"). Rules: `content/services/validation.py`.

**#17 - Rich text pipeline.** `body_format` is `md` (markdown-it-py, raw HTML disabled) or
`html`; both pass through an nh3 allow-list (p b strong i em u s sub sup ul ol li table thead
tbody tr th td code pre blockquote br img span h1-h4 hr). No `style`, no `on*`, no links
(`a` is not allowed), `img src` only `/media/<dir>/<file>` (our own uploads: no host, no
scheme, no `..`). Only `*_html` is for display; `*_src` is kept verbatim for editing. A
test's description is markdown only. Media URLs inside rich text must belong to the test's
branch. Option text uses its question's `body_format`.

**#18 - Media upload.** Type by magic bytes only (JPEG/PNG/WebP; SVG, GIF and everything
else refused; filename and Content-Type ignored). Pillow decodes and RE-ENCODES (EXIF/ICC/
trailing data gone, orientation baked in). Max 5 MB and 4096 px per side, decompression-bomb
guard (`Image.MAX_IMAGE_PIXELS` + warning-as-error). Stored as `uploads/<uuid>.<ext>`; dedup
by sha256 of the re-encoded bytes per branch. nginx already caps bodies at 10 MB and serves
`/media/` with `nosniff`. Media is branch-scoped and can't be attached across branches, even
by a superadmin (it must match the test's branch).

**#19 - Deletion policy.** Users are never deleted through the API: `DELETE` deactivates. A
subject that has tests -> 409. A published test can't be deleted (unpublish/archive first).
A branch that still has users/content -> 409 (`PROTECT`). Reason: Phase 2 attempts will
reference tests; nothing referenced may vanish by one stray click. Media files are not
garbage-collected yet.

**#20 - Staff API returns `is_correct`; the public API must NEVER.** Staff endpoints
(`/tests/`, `/questions/`) include `is_correct`, `explanation` and `*_src` because editors
need them. The Phase 2 student/public API must use separate serializers that omit
`is_correct` (and, per `result_visibility`, `explanation`) until an attempt is finished, and
must serve only `status=published` tests of active branches/subjects.


## Phase 2 decisions (implemented)

**#21 - The public API is deliberately AllowAny with NO authentication classes.**
`/api/v1/public/*` views set `permission_classes=[AllowAny]` and `authentication_classes=[]`.
Because no session is ever consulted, there is no ambient credential for CSRF to protect
(even a logged-in staff member is anonymous there), so no CSRF token is required. An attempt
is authorised only by its access token. Everything visible goes through the single
`public_branches/public_subjects/public_tests` helpers in `content/scoping.py`: active
branch + active subject + `published` + at least one question. Subjects without a visible
test are hidden from the picker. Draft/archived/inactive things answer `404`.

**#22 - Route names.** Student pages live under `/filial/<slug>/<fan-slug>`, `/test/<id>`,
`/yechish/<token>`, `/natija/<token>`; panel is `/panel`, staff login `/kirish`. Since the
branch slug always sits under `/filial/`, no reserved-slug list is needed for branches.

**#23 - Unified answer-safety rule.** Public payloads are built from explicit whitelists
(`attempts/serializers.py`): during `in_progress` nothing carries `is_correct`, correct ids,
`explanation` or the score - not in start/detail/answers responses and not in error bodies
(tests assert the strings never occur). `result` answers `409` until the attempt is closed;
a closed attempt's `GET /attempts/{token}/` no longer returns the questions.

**#24 - Token and device cookie.** `access_token` = `secrets.token_urlsafe(32)` (256 bits,
unique). It is the credential for solve AND result links and lives in the URL
(`/yechish/<token>`, `/natija/<token>`); the frontend also keeps it in localStorage per test
only to offer "Davom ettirish". Wrong/malformed tokens are `404`. Referrer policy is
`same-origin`. Known trade-off: the token appears in nginx/gunicorn access logs; treat logs as
sensitive. A second cookie `tp_device` (random, HttpOnly, SameSite=Lax, Secure in prod,
1 year) identifies the browser for attempt limits.

**#25 - Snapshots.** `AttemptItem.question_snapshot` (JSONB) freezes body, image url, type,
points, explanation and every option (id, text, image url, order, `is_correct`) in DISPLAY
order, including the shuffle (seed stored, order frozen: refresh never reorders). Editing or
deleting options/questions later never changes a stored result. `Attempt.test` and
`AttemptItem.question` are PROTECT: a test with attempts, or a question used in one,
cannot be deleted (`409`; archive/edit instead). Option rows may be deleted freely (the
snapshot is the truth). `pass_percent` is frozen at start; `result_visibility` is read LIVE
from the test (a teacher may reveal results later). Uploaded image files are not
garbage-collected yet, so deleting a media file would break old images.

**#26 - `max_attempts` in the anonymous flow = per device (cookie).** No phone/login means it
cannot be enforced strictly. Rules: (1) at most ONE running attempt per device+test, enforced
by a partial unique DB constraint: the same name resumes it (`200`, `resumed: true`), a
different name gets `409` (+ the token so the unfinished one can be closed); (2)
`max_attempts` counts all attempts of that device+test (`403` when used up); (3) clearing
cookies or another device resets it - accepted as a soft limit. Abuse control is by IP:
30 attempt creations/hour (DRF) plus nginx `limit_req`. Shared school computers: student B on
the same browser can start a new attempt once A's is finished/expired; a different name while
A's is still running is refused.

**#27 - Grading.** `single`: full points if the one correct option is chosen. `multiple`:
full points only on an EXACT match of the correct set; no partial credit (a wrong extra
option = 0). Unanswered = 0. `percent` = score/max_score, 2 decimals; `passed` = percent >=
frozen `pass_percent`. Score is computed only when the attempt closes.

**#28 - Server-side time, lazy expiry.** The server sets `deadline_at`; every response carries
`remaining_sec` and the client counts down from it (performance.now, not the wall clock) and
re-syncs on each save/visibility change. Expiry is LAZY (no celery-beat in Phase 2): every
touch of an attempt (GET/answers/finish/result/start of the same device) first closes it if
`deadline_at` passed: status `expired`, graded from the answers already stored, `finished_at =
deadline_at`. Answers after the deadline: `410` (3 s network grace); after finish: `409`.
Finish is idempotent. An abandoned in-progress attempt of an unlimited test stays open
(no deadline) - Phase 3/6 may add cleanup. Expiry is committed even when the request itself
fails with 410.

**#29 - Throttling.** DRF scopes (`public_read` 300/min, `public_answers` 600/min per IP,
`attempt_create` 30/hour per IP, `attempt_token` 180/min per token) keyed by the real client
IP (nginx overwrites X-Forwarded-For, `NUM_PROXIES=1`), plus nginx zones: `/api/v1/public/`
20 r/s burst 60, attempt creation 10 r/min burst 15. Limits are per IP, so a classroom behind
one NAT address shares them - hence the generous read/answer numbers.

**#30 - Validation.** Name: whitespace collapsed, 2-60 chars, letters/space/apostrophes
(U+0027 U+2018 U+2019 U+02BB U+02BC, backtick)/hyphen only, starts with a letter, >= 2
letters. Age: integer 4-100. Both errors are Uzbek. `ip` and `user_agent` are stored on the
attempt.

## Phase 3 decisions (implemented)

**#31 - Results scope.** `attempts_for` = `scope_for` (superadmin all, admin own branch) plus,
for teachers, `test__subject__teachers=user` (only assigned subjects, same rule as #13). List,
detail, summary and export all start from it (summary also from `tests_for`). The `branch` filter
can only narrow, never widen. Isolation tests: `attempts/tests/test_results.py`. Results are
read from the frozen snapshots (#25), so editing a test never changes a stored result. Question
statistics group by `AttemptItem.question_id`; "most chosen wrong option" counts selected
non-correct option ids from the snapshots. In-progress attempts are hidden unless
`status=in_progress` is requested. Averages/pass rate ignore ungraded attempts.

**#32 - Excel export.** `openpyxl` write-only, built in memory (<= 10 000 rows, else `400`; no
truncation so the file is never silently incomplete). Formula injection: every text cell that
starts with `= + - @ TAB CR LF` gets a leading apostrophe AND is written with an explicit string
cell type. CSV was not added (xlsx only) to avoid a second, weaker-escaping format.

**#33 - Telegram result notification.** No bot process: when an attempt closes (`finalize()`,
covers finish and lazy expiry) `transaction.on_commit` queues the Celery task
`attempts.tasks.notify_attempt_finished`; it posts `sendMessage` (HTML, escaped, <= 4096 chars,
no link preview) with stdlib `urllib` (no new dependency). Idempotent: the task claims the attempt
with a conditional UPDATE of `Attempt.telegram_notified_at`, releases the claim on failure. Retries:
429 waits `retry_after + 1`, other retryable errors back off 30 s * 2^n (max 5); 4xx are permanent
(logged). Every failure (broker down, Telegram down, bug) is swallowed/logged and cannot affect the
student flow. Off silently unless `TELEGRAM_BOT_TOKEN` and a chat (branch or `TELEGRAM_CHAT_ID`) are
set. The message links to the STAFF panel (`PUBLIC_BASE_URL/panel/natijalar/<id>`, login required);
the student's secret `/natija/<token>` link is never sent. `PUBLIC_BASE_URL` empty/non-http(s) ->
no link. The token appears only in the request URL and is never logged. The celery container joined
the `public` network (the `internal` one has no internet). Check with `manage.py telegram_test`.
Setup steps: `/docs/TELEGRAM.md`.

**#34 - Branch chat id is superadmin-only.** `Branch.telegram_chat_id` is written only by
superadmin (branch writes already were) and hidden from admin/teacher responses. Letting an admin
redirect result messages (child names) to an arbitrary chat is a data-leak risk, and it keeps the
permission matrix unchanged. Revisit if branch admins should manage it themselves.

## Future decisions (recorded now, implemented in their phase)

**F1 - Content hierarchy:** Branch -> Subject (belongs to ONE branch) -> Test -> Question ->
Option. `Test` and `Attempt` carry a denormalized `branch_id` for cheap scoping. Subjects
must be **cloneable to another branch** together with their tests (transactional copy).

**F2 - User management:** superadmin creates any user; branch admin creates teachers and
admins only in their own branch. A teacher may be assigned several subjects (M2M) and can
create/edit tests and view results for those subjects only.

**F3 - Question types:** `single`, `multiple`, `text`. Only single + multiple are
implemented; `text` (manual grading later) is reserved in the model. Options are unlimited
but >= 2 (validated). Options may have images (`Option.image` -> `MediaAsset`). Question
body is Markdown/HTML + image, sanitized server-side with nh3.

**F4 - Student flow is anonymous on the web:** branch -> subject -> test -> name + age ->
solve (server-side timer; the server, not the client, decides when time is up) -> result
link with an unguessable token. `Attempt` stores `full_name`, `age`. The Telegram bot
(Phase 5: phone -> name -> ...) is not built earlier.

**F5 - Phases:** 0 foundation; 1 Subject/permissions/staff panel/test CRUD + editor;
2 student web flow; 3 results/export; 4 import; 5 bot; 6 extras. See ROADMAP.md.

## Open questions / risks

- ~~Block login for inactive branches?~~ Decided in #12.
- Media garbage collection (orphaned files after questions are deleted) is not implemented.
- Uploaded files are served straight from the media volume; consider a per-branch access
  check only if some branches' images must stay private (currently URLs are unguessable UUIDs).
- Production domain and host-nginx setup are pending (see DEPLOYMENT.md).
- Media storage: local volume behind nginx for now; move to object storage if volume grows.

## Frontend redesign: "friendly" design system

- **Style:** bright and friendly (soft colors, round shapes, colored accents, light motion),
  student side livelier, staff panel denser but on the same tokens. One system, light + dark.
- **Theme:** `prefers-color-scheme` by default, manual toggle persisted in localStorage
  (try/catch), applied by an inline pre-paint script to avoid a wrong-theme flash.
- **Font:** Nunito (rounded, full Latin Extended incl. Uzbek modifier apostrophes), self-hosted
  through `next/font`.
- **Icons:** added `lucide-react` (small, per-icon imports) and removed inline SVG icon paths.
  Sticker/emoji icons stay banned.
- **No behavior change:** API, routes, permissions and copy semantics are untouched; only the
  visual layer and layout of pages/components changed.
