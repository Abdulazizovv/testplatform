# testplatform

O'quv markaz va maktab filiallari uchun bilim sinash platformasi. Modular monolit:
Django + DRF + PostgreSQL + Redis + Celery (backend), Next.js + TypeScript + Tailwind
(frontend), nginx (bitta origin).

Holat: **Faza 0 (poydevor)** tayyor — infratuzilma, autentifikatsiya (login/parol, session
cookie + CSRF), Branch/User modellari, ruxsat qatlami, minimal frontend. Test yaratish va
yechish keyingi fazalarda (`docs/ROADMAP.md`).

## Tezkor ishga tushirish (Docker)

```bash
cp .env.example .env
# .env ni tahrirlang: DJANGO_SECRET_KEY, POSTGRES_PASSWORD (CHANGE_ME lar)
# Lokal http://localhost da sinash uchun: DJANGO_SECURE_SSL=False
make up                # build + ishga tushirish
make createsuperuser   # role=superadmin
```

Sayt: http://localhost:7788 (nginx faqat 127.0.0.1 da), admin: `/admin/`,
sog'liq: `/healthz/` (backend), `/healthz` (frontend).

Filial va foydalanuvchilarni superadmin `/admin/` orqali yaratadi (admin/o'qituvchi uchun
filial majburiy).

## Lokal dev (Docker'siz)

```bash
# backend (SQLite, Redis'siz)
cd backend && python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DJANGO_DEBUG=True
python manage.py migrate && python manage.py createsuperuser
python manage.py runserver            # :8000

# frontend (boshqa terminal) — /api va /admin :8000 ga proksi qilinadi
cd frontend && npm install && npm run dev   # :3000
# lokal dev uchun .env: CSRF_TRUSTED_ORIGINS=http://localhost:3000
```

## Buyruqlar

`make help` — barchasi. Asosiylari: `up`, `down`, `ps`, `logs`, `migrate`, `makemigrations`,
`createsuperuser`, `test`, `lint`, `fe-dev`, `fe-build`.

## Hujjatlar

`CLAUDE.md` (ish qoidalari) · `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/API.md` ·
`docs/DECISIONS.md` · `docs/ROADMAP.md` · `docs/DEPLOYMENT.md`
