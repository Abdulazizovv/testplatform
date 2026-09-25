# testplatform — Engineering Instructions

Bilim sinash platformasi: o'quv markaz / maktab filiallari uchun test tizimi. This file
governs implementation work in this repo. Decisions live in `/docs`. Read
`/docs/DECISIONS.md` and `/docs/ROADMAP.md` before starting any feature — they say what is
in scope for the current phase and why.

## Non-negotiables

- **Permissions are enforced in one place.** Every queryset returned from an API view goes
  through `apps.core.scoping.scope_for` (or a helper built on it, like
  `apps.accounts.scoping`). Never hand-roll `filter(branch=...)` in a view. Every new
  branch-owned model gets a scoping helper AND a test proving branch A's admin cannot see
  branch B's rows (see `apps/core/tests/test_scoping.py`).
- **Role checks use `apps.core.permissions`** (`IsSuperAdmin`, `IsBranchAdmin`,
  `IsTeacher`, ...). DRF's default permission is `IsAuthenticated`; an open endpoint must say
  `AllowAny` explicitly and be a deliberate decision (the anonymous student flow, Phase 2).
- **Branch admins create users only inside their own branch.** Teachers only touch
  subjects assigned to them. Never trust a `branch` value from the request body for
  non-superadmins — take it from `request.user`.
- **Don't build ahead of the roadmap.** Check `/docs/ROADMAP.md`. Current phase: 0, 1a, 1b, 2
  (anonymous student web flow) and 3 (results, xlsx export, Telegram result notification) done;
  4 (import) is next. No interactive bot, no celery-beat, no import before their phase. Ideas for later go to `/docs/ROADMAP.md` or
  `/docs/DECISIONS.md`. The staff API returns `is_correct`; the public API (`apps/attempts`, `/api/v1/public/`) never returns `is_correct`/`explanation` while an attempt is in progress.
- **Sanitize all rich text server-side** (`nh3`, via `content.services.sanitize.render_rich`)
  before storage. Never `dangerouslySetInnerHTML` unsanitized content.
- **Every list endpoint is paginated** (`apps.core.pagination.StandardPagination`). The
  frontend never assumes a bare array.
- **All user-facing copy is Uzbek Latin** (natural, not literal translation). Backend error
  messages the UI shows are Uzbek too. Code, comments, docs may be English.
- **No fake data in the UI**: no invented statistics, customers, reviews, or "lorem" numbers —
  even as placeholders.
- **No domain names hardcoded** anywhere. The production domain is undecided; it lives only
  in `.env` (`DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`) and the host nginx.
- **No secrets in git.** `.env` is ignored; `.env.example` holds placeholders only.

## Architecture reference

- Backend: Django + DRF + PostgreSQL + Redis + Celery in `backend/`, modular monolith under
  `backend/apps/` (`core`, `branches`, `accounts`, `content`; more per phase). Frontend: Next.js
  (App Router) + TypeScript + Tailwind 4 in `frontend/`.
- Auth: Django session cookie + CSRF, same origin, no JWT. Endpoints `/api/v1/auth/{csrf,
  login,logout,me}/`. No registration endpoint exists — accounts are created by a
  superadmin (Django admin) or a branch admin (Phase 1 staff panel).
- API base path `/api/v1/`; see `/docs/API.md`. Schema: `/docs/DATABASE.md`.
- Don't add a new service/datastore/dependency without checking `/docs/ARCHITECTURE.md` and
  updating it if the decision changes.

## Working style

- Modular monolith: each Django app / Next route group is independent.
- Prefer Server Components; Client Components only for interactivity. The Next.js in this repo
  has breaking changes vs. older versions — read the relevant guide in
  `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`).
- Models: extend `apps.core.models.BaseModel` (UUID pk + timestamps).
- After backend model changes: `make makemigrations` then `make migrate`.
- Tests: `make test`. Lint: `make lint`. A change isn't done until both pass.
- When a request is risky, over-engineered, or breaks a rule above, say so and propose the
  better option; record non-obvious decisions in `/docs/DECISIONS.md`.

## Before marking a UI feature "done"

- Works at 375–430px width, not only desktop; tap targets >= 44px; inputs >= 16px font.
- Uzbek Latin copy, no placeholder numbers, respects `prefers-reduced-motion`.
- Protected pages check the session server-side (`lib/session.ts`), not just hide links.
