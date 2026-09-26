# Frontend (Next.js 16, Tailwind 4)

Staff panel for the test platform. Read `AGENTS.md` before writing Next code.

## Run
- `npm run dev` (needs the backend on `API_INTERNAL_URL`, default `http://127.0.0.1:8000`;
  `/api` and `/admin` are proxied. `/media` is NOT proxied in dev, so uploaded images only
  show through the compose nginx).
- `npm run lint`, `npm run build`.

## Layout
- `src/app/panel/**`: pages (Server Components) + `*-view.tsx` Client Components.
- `src/components/`: panel shell, test form/actions, question editor, rich/image fields;
  `components/ui/`: primitives.
- `src/lib/`: `api.ts` (fetch wrapper), `session.ts` (server), `types.ts` (mirrors docs/API.md),
  `rich.ts` (preview sanitizing), `math.ts` (KaTeX rendering of `data-tex` elements), `question-rules.ts` (live mirror of publish validation).

## Conventions
Uzbek Latin copy, light + dark theme tokens in `globals.css`, tap targets >= 44px on mobile,
no fake data. Question reorder uses up/down buttons (no drag-drop dependency).

## Design system
Tokens, themes (light/dark), radius/shadow/motion scales: `src/app/globals.css`. Font: Nunito
(next/font, latin + latin-ext). Icons: `lucide-react`. Student pages use the `tint-N` colored
cards; the panel uses the same tokens. Do not hardcode palette colors in components; use tokens
so both themes keep AA contrast. See `docs/ARCHITECTURE.md` (Design system).
