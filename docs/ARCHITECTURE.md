# Architecture

## 1. Style

Modular monolith: one Next.js frontend, one Django backend, clear module boundaries inside
each. No microservices. Extract a service only for a real scaling/ownership problem.

## 2. Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS 4. shadcn/ui is added
  when the first real UI (Phase 1 staff panel) needs primitives.
- **Backend:** Python 3.12, Django + DRF, gunicorn, whitenoise, django-environ, django-axes.
- **Data:** PostgreSQL 16 (primary), Redis 7 (cache/throttling counters + Celery broker on a
  separate db).
- **Async:** Celery worker. No celery-beat until the first periodic job exists. No tasks
  exist yet in Phase 0 - the worker is wired and health-checked so Phase 2+ can use it.
- **Infra:** Docker Compose; nginx container routes one origin; TLS and the public domain
  live in the *host* nginx (outside this repo).

## 3. Runtime topology

```
browser --TLS--> host nginx (certs, domain) --> 127.0.0.1:${NGINX_PORT:-7788}
                                                  |
                                       nginx container (no TLS, no domain)
                    /api /admin /static /media /healthz/ --> backend (gunicorn :8000)
                    everything else                       --> frontend (Next.js :3000)
backend/celery --> postgres, redis   (internal network only)
```

Networks: `public` (nginx, backend, frontend) and `internal` (`internal: true` - postgres,
redis, celery; no outbound internet). Only nginx publishes a port, bound to loopback.
Every service has a healthcheck and json-file log rotation (10 MB x 3); backend and
frontend run as non-root users.

## 4. Backend modules (`backend/apps/`)

| App | Responsibility |
|---|---|
| `core` | `BaseModel` (UUID + timestamps), `Role`, `scope_for`, DRF permission classes, pagination, `/healthz/` |
| `branches` | `Branch` |
| `accounts` | custom `User`, session auth API, `users_for`/`branches_for` scoping |

| `attempts` (Phase 2) | anonymous student flow: `Attempt`, `AttemptItem` (snapshots), public API `/api/v1/public/`, throttles, lifecycle/grading services |
| `content` (Phase 1a) | `Subject`, `Test`, `Question`, `Option`, `MediaAsset`; services for sanitizing, media upload, question validation, cloning |

Later phases add further apps, each separate. New runtime dependencies in Phase 1a:
`nh3` (HTML sanitizer), `Pillow` (image re-encoding), `markdown-it-py` (markdown -> HTML).

## 5. Authentication

Django session cookie + CSRF, same origin (no CORS, no JWT).
- `GET /api/v1/auth/csrf/` sets the `csrftoken` cookie and returns the token.
- `POST /login/` and `/logout/` are wrapped in `csrf_protect` (DRF alone only enforces CSRF
  for already-authenticated sessions, which would leave login-CSRF open).
- The SPA sends `X-CSRFToken`. `sessionid` is HttpOnly + SameSite=Lax + Secure (prod).
- Protected Next pages verify the session server-side by forwarding the cookie to
  `http://backend:8000/api/v1/auth/me/` (`frontend/src/lib/session.ts`).
- No registration. Accounts come from a superadmin or a branch admin.

## 6. Authorization (the core safety net)

Two layers, always used together:
1. **Who may call it** - `apps.core.permissions` (`IsSuperAdmin`, `IsBranchAdmin`,
   `IsTeacher`, `IsSuperAdminOrBranchAdmin`, `IsStaffMember`, object-level
   `IsSameBranchOrSuperAdmin`).
2. **Which rows they get** - `apps.core.scoping.scope_for(user, queryset, branch_lookup)`:
   superadmin = all; admin/teacher = own branch; anonymous/inactive/no-branch = none.
   Model helpers (`branches_for`, `users_for`) wrap it; teachers see only themselves in users.

Views never filter by branch themselves. Tests in `apps/core/tests/test_scoping.py` prove a
branch admin cannot see another branch's data.

## 7. Security

- Production defaults: `DEBUG=False`, refuses to start with a short/placeholder
  `DJANGO_SECRET_KEY`, secure cookies, `SECURE_PROXY_SSL_HEADER`, SSL redirect + HSTS
  (`DJANGO_SECURE_SSL=False` only for local http testing). `ALLOWED_HOSTS` always includes
  `localhost` (container healthcheck) and `backend` (Next server-side calls).
- Rate limiting, three layers: nginx `limit_req` (30 r/s per IP on /api, 10 r/min on login, 20 r/s on /api/v1/public/, 10 r/min on attempt creation);
  DRF throttles (anon 120/min, user 300/min, login 10/min) on Redis; django-axes locks a
  username+IP pair after 5 failed logins for 15 min.
- nginx recovers the real client IP from the host nginx's `X-Forwarded-For` (trusting only
  private ranges) and *overwrites* `X-Forwarded-For`/`X-Real-IP` toward the backend so
  clients can't spoof them.
- Login errors are generic (no user enumeration). Password min length 10.
- Rich text: markdown-it-py + `nh3` allow-list on every write (`content.services.sanitize`);
  uploads: magic-byte type check, Pillow re-encode, 5 MB / 4096 px caps (decisions #17, #18).
- Django admin is reachable only by superadmins (`is_staff` is derived from role).

## 8. Logging

JSON to stdout everywhere: Django (`python-json-logger`), gunicorn access log, nginx access
log. Collected by Docker json-file rotation; ship elsewhere later if needed.

## 9. Frontend structure

Student routes (public; Server Components read `/api/v1/public/` via `lib/public-server.ts`, interactive parts are Client Components using `lib/public-client.ts`): `/` (branches), `/filial/[slug]`, `/filial/[slug]/[fan]`, `/test/[id]` (+ name/age form), `/yechish/[token]` (solver: one question at a time, autosave, server-derived countdown, beforeunload guard), `/natija/[token]`. Staff routes: `/kirish`, `/healthz`, and the protected
staff panel `/panel` (dashboard), `/panel/filiallar` (superadmin), `/panel/foydalanuvchilar`
(superadmin, admin), `/panel/fanlar`, `/panel/testlar`, `/panel/testlar/[id]` (editor).
`panel/layout.tsx` checks the session server-side (`requireUser`) and each page checks its
allowed roles; the sidebar only hides links.

- `lib/api.ts`: the only browser fetch wrapper (cached CSRF token, one retry on CSRF failure,
  403 -> `/auth/me/` check -> redirect to `/kirish`, `ApiError` with field errors, multipart upload).
- `lib/session.ts`: server-side `getCurrentUser`, `requireUser`, `serverGet` (dashboard counts).
- `lib/rich.ts`: markdown-it (html off) + DOMPurify with the same allow-list as nh3, for
  previews only; the server re-sanitizes. New dependencies: `markdown-it`, `dompurify`.
- `components/ui/*`: shadcn-style primitives written in-repo (no Radix): Button, Field/Input/
  Select/Textarea, Dialog (native `<dialog>`), Toast, Badge, Pagination, states.
- List pages are Client Components fetching via `useFetch`; pages themselves are Server
  Components. The browser only uses relative URLs, so the image contains no domain.

### Design system (frontend)

- Tokens live in `src/app/globals.css` (semantic names: `surface`, `subtle`, `foreground`,
  `muted`, `accent`, `success`/`danger`/`warning` + `*-soft`/`*-line`). Light is default; dark
  follows `prefers-color-scheme` unless `data-theme` is set on `<html>` (toggle stores
  `tp:theme` in localStorage; an inline script in `layout.tsx` applies it before first paint).
  Components use only these tokens, never palette colors, so both themes stay AA.
- Six playful tints (`tint-0..5` classes exposing `--t-bg/--t-solid/--t-fg`) color the student
  cards; the staff panel uses them sparingly (dashboard icon tiles).
- Font: Nunito via `next/font/google` (self-hosted at build time, `latin` + `latin-ext`).
- One radius scale (chips full, cards 2xl/3xl, controls xl), tinted shadows, CSS-only motion
  (`anim-rise`, `anim-pop`, skeleton shimmer); everything collapses under
  `prefers-reduced-motion` and the confetti is not rendered at all in that mode.
- Icons: `lucide-react` (only new dependency; tree-shaken per icon). Logo mark:
  `components/logo.tsx`; favicon: `app/icon.svg`.
- Mobile: dialogs dock to the bottom as sheets below `sm`; the solver has a sticky bottom action
  bar and a question-palette sheet.
- Caveat: `cn()` does not merge conflicting Tailwind classes, so pass overrides that do not
  clash with the base class (use variants such as `max-sm:hidden`, not `hidden` on a `Button`).
