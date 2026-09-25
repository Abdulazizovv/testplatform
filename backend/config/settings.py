"""
Django settings for the testplatform backend.

Everything environment-specific comes from env vars (see .env.example at the repo
root). Defaults are the *strict* choice: DEBUG off, secure cookies on. See
docs/ARCHITECTURE.md and docs/DECISIONS.md for the reasoning.
"""

import sys
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

env = environ.Env()
# Single .env at the repo root, shared with docker-compose.yml (inside the containers
# the values arrive through env_file instead, and this file simply doesn't exist).
environ.Env.read_env(REPO_ROOT / ".env")

TESTING = "test" in sys.argv

SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
DEBUG = env.bool("DJANGO_DEBUG", default=False)

if not DEBUG and len(SECRET_KEY) < 50:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be a real, long secret (50+ chars) when DJANGO_DEBUG=False. "
        "Generate one: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )
if not SECRET_KEY:
    SECRET_KEY = "django-insecure-dev-only-key"  # reachable only with DEBUG=True

# "localhost" must always be allowed: the container HEALTHCHECK calls
# http://localhost:8000/healthz/. "backend" is the compose-internal name the Next.js
# server uses for its server-side calls. Both are unreachable from outside anyway
# (only nginx reaches the backend, and host nginx sets the real Host header).
ALLOWED_HOSTS = sorted(
    set(env.list("DJANGO_ALLOWED_HOSTS", default=[])) | {"localhost", "127.0.0.1", "backend"}
)

# Exact scheme+host origins allowed to POST cookie-authenticated requests, e.g.
# https://<your-domain>. Comes from .env - never hardcode a domain here.
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "axes",
    "apps.core",
    "apps.branches",
    "apps.accounts",
    "apps.content",
    "apps.attempts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
    )
}
DATABASES["default"]["CONN_MAX_AGE"] = 60

AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",  # must be first: enforces lockouts
    "django.contrib.auth.backends.ModelBackend",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
WHITENOISE_MANIFEST_STRICT = False

# Media uploads (images only, re-encoded; see apps/content/services/media.py)
MEDIA_MAX_BYTES = 5 * 1024 * 1024
MEDIA_MAX_SIDE = 4096

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Cache (Redis) ----------------------------------------------------------
# DRF throttling and axes counters live here; without Redis each gunicorn worker
# would keep its own counter and limits would be ineffective. Unset = in-memory
# (bare local dev / tests only).
REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        }
    }

# --- Session / CSRF (same-origin, cookie auth) --------------------------------
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# The SPA reads the csrftoken cookie and echoes it in X-CSRFToken.
CSRF_COOKIE_HTTPONLY = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"

# TLS terminates at the *host* nginx, never in Django. DJANGO_SECURE_SSL=False exists
# only for testing the compose stack over plain http://localhost (see DEPLOYMENT.md).
SECURE_SSL = env.bool("DJANGO_SECURE_SSL", default=True) and not DEBUG
if SECURE_SSL:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = not TESTING
    # Container HEALTHCHECK is plain http without X-Forwarded-Proto.
    SECURE_REDIRECT_EXEMPT = [r"^healthz/$"]
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = False  # enable only once the real domain is decided

# --- Celery -----------------------------------------------------------------
# Worker only for now; celery-beat is added when the first periodic job exists.
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="")
CELERY_TASK_ALWAYS_EAGER = not CELERY_BROKER_URL  # bare dev: run tasks inline
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_IGNORE_RESULT = True
CELERY_TIMEZONE = TIME_ZONE
CELERY_WORKER_HIJACK_ROOT_LOGGER = False  # keep our JSON logging config
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# --- Telegram result notifications (decision #33) ----------------------------
# Off (silently) unless BOT_TOKEN and a chat (per-branch or the shared one) are set.
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="").strip()
TELEGRAM_CHAT_ID = env("TELEGRAM_CHAT_ID", default="").strip()
# Public site origin used only for the "Batafsil" link (e.g. https://<domain>); empty -> no link.
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", default="").strip().rstrip("/")

# --- DRF ---------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    # Secure by default: every endpoint requires login unless it opts out explicitly.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "300/min",
        "login": "10/min",
        # Anonymous student API (apps/attempts/throttles.py). Per IP unless noted; a whole
        # classroom can share one NAT address, so reads/answers are generous.
        "public_read": "300/min",
        "public_answers": "600/min",
        "attempt_create": "30/hour",
        "attempt_token": "180/min",  # per attempt token
    },
    # nginx overwrites X-Forwarded-For with the real client IP (single value);
    # see nginx/default.conf.
    "NUM_PROXIES": 1,
}

# --- Login brute-force protection (django-axes) --------------------------------
AXES_FAILURE_LIMIT = env.int("AXES_FAILURE_LIMIT", default=5)
AXES_COOLOFF_TIME = timedelta(minutes=env.int("AXES_COOLOFF_MINUTES", default=15))
AXES_LOCKOUT_PARAMETERS = [["ip_address", "username"]]
AXES_RESET_ON_SUCCESS = True
AXES_IPWARE_META_PRECEDENCE_ORDER = ["HTTP_X_REAL_IP", "REMOTE_ADDR"]

# --- Logging (JSON to stdout) -------------------------------------------------
LOG_LEVEL = env("DJANGO_LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            "rename_fields": {"asctime": "ts", "levelname": "level", "name": "logger"},
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
}
