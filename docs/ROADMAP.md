# Roadmap

Do not start a phase's work before the previous phase is accepted. Extra ideas go in the
"Phase 6" bucket, not into the current phase.

## Phase 0 - Foundation (DONE)
Docker Compose stack (postgres, redis, backend, celery, frontend, nginx), Branch + User
models, session auth API, permission layer skeleton + tests, Django admin for Branch/User,
healthchecks, JSON logs, rate limiting, minimal frontend (home placeholder, /kirish, /panel),
docs, Makefile.

## Phase 1a - Backend: subjects, users, tests, media (DONE)
- `Subject`, teacher <-> subject M2M, subject cloning (superadmin cross-branch), `Test`,
  `Question` (single/multiple; `text` reserved), `Option` (unlimited, images), `MediaAsset`
  upload pipeline, nh3 sanitization, publish validation, test duplicate.
- Branch/user management API, inactive-branch lockout.
- Cross-branch and cross-subject permission tests for every endpoint; docs updated.
- Details: `/docs/API.md`, decisions #12-#20 in `/docs/DECISIONS.md`.

## Phase 1b - Staff panel UI + test editor (DONE)
- Staff panel: admins create teachers/admins in their branch, teachers see their subjects,
  subject/test lists, subject clone dialog.
- Test editor UI (markdown/HTML question body, image upload, options, reorder, publish),
  shadcn/ui primitives. Consumes the Phase 1a API.

## Phase 2 - Student web flow (DONE)
Anonymous: branch -> subject -> test -> name + age -> solve with server-side timer ->
result link (token). App `attempts`, public API `/api/v1/public/` (decisions #21-#30), routes
`/`, `/filial/<slug>[/<fan>]`, `/test/<id>`, `/yechish/<token>`, `/natija/<token>`. Strict
throttling (DRF + nginx). Not in this phase: results dashboard/export (3), import (4), bot (5).

## Phase 3 - Results, export and Telegram notification (DONE)
Staff results API `/api/v1/results/` (list + filters + summary, detail from snapshots, per-test
question analysis, xlsx export, all scoped), panel pages `/panel/natijalar[/id|/test/id]`,
dashboard latest results. Telegram result message per finished attempt (Celery task, Bot API
over HTTPS, no bot process): decisions #31-#34, setup in `/docs/TELEGRAM.md`. Next: Phase 4
(import), then Phase 5 (interactive bot).

## Phase 4 - Import (NEXT)
Import tests/questions from files (format TBD).

## Phase 5 - Telegram bot
Phone -> name -> ... identification and test flow through the bot; Celery-based.

## Phase 6 - Extras
Text-question manual grading, analytics, celery-beat jobs, etc. (prioritise later).
