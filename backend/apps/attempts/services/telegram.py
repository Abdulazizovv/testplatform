"""
Telegram result notifications (decision #33): plain Bot API over HTTPS (urllib), no bot
process, no extra dependency. Called only from the Celery task, never from a request.

The bot token lives in the request URL, so it must never be logged: errors are reported by
status code / Telegram's own description only.
"""

import html
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.utils import timezone

from ..models import AttemptStatus
from .formatting import attempt_duration_sec, format_duration, format_percent

logger = logging.getLogger(__name__)

API_URL = "https://api.telegram.org/bot{token}/{method}"
MAX_MESSAGE = 4096
TIMEOUT = 10
_NAME_MAX = 100


class TelegramError(Exception):
    """`retryable`: worth another try; `retry_after`: seconds Telegram asked us to wait (429)."""

    def __init__(self, message, retryable=True, retry_after=None):
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after


def is_enabled():
    """Cheap check used before queueing: a bot token exists (chat is resolved per branch later)."""
    return bool(settings.TELEGRAM_BOT_TOKEN)


def chat_id_for(branch):
    return (branch.telegram_chat_id or "").strip() or settings.TELEGRAM_CHAT_ID


def _esc(text, limit=_NAME_MAX):
    text = " ".join(str(text or "").split())
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return html.escape(text, quote=True)


def _result_url(attempt_id):
    base = settings.PUBLIC_BASE_URL
    if not base.startswith(("http://", "https://")):
        return None
    return f"{base}/panel/natijalar/{attempt_id}"


def build_message(attempt):
    """HTML message for a closed attempt. Every user-controlled string is escaped."""
    test = attempt.test
    icon = "✅" if attempt.passed else "❌"
    verdict = "O'tdi ✅" if attempt.passed else "O'tmadi ❌"
    finished = timezone.localtime(attempt.finished_at or timezone.now())
    lines = [
        f"{icon} <b>Yangi test natijasi</b>",
        f"👤 <b>{_esc(attempt.full_name, 60)}</b>, {int(attempt.age)} yosh",
        f"📚 Fan: {_esc(test.subject.name)} · 🏫 Filial: {_esc(attempt.branch.name)}",
        f"📝 Test: {_esc(test.title, 150)}",
        f"🎯 Natija: <b>{attempt.score}/{attempt.max_score} ({format_percent(attempt.percent)}%)</b>"
        f" — {verdict} (o'tish: {int(attempt.pass_percent)}%)",
    ]
    if attempt.status == AttemptStatus.EXPIRED:
        lines.append("⏱ Vaqt tugagani uchun avtomatik yakunlandi")
    lines.append(
        f"⏱ Davomiyligi: {format_duration(attempt_duration_sec(attempt))}"
        f" · 🕒 {finished:%d.%m.%Y %H:%M}"
    )
    url = _result_url(attempt.pk)
    if url:
        lines.append(f'🔗 <a href="{html.escape(url, quote=True)}">Batafsil ko\'rish</a>')
    return "\n".join(lines)[:MAX_MESSAGE]


def api_call(method, payload=None):
    """POST a Bot API method. Raises TelegramError; never logs the token."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise TelegramError("TELEGRAM_BOT_TOKEN sozlanmagan.", retryable=False)
    req = urllib.request.Request(
        API_URL.format(token=token, method=method),
        data=json.dumps(payload or {}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310 - fixed https host
            body = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or "{}")
        except ValueError:
            body = {}
        description = body.get("description") or f"HTTP {e.code}"
        if e.code == 429:
            retry_after = (body.get("parameters") or {}).get("retry_after")
            raise TelegramError(description, retryable=True, retry_after=retry_after)
        # 4xx (bad token / chat not found / bot blocked) will not fix itself; 5xx may.
        raise TelegramError(description, retryable=e.code >= 500)
    except (urllib.error.URLError, OSError) as e:
        raise TelegramError(f"tarmoq xatosi: {type(e).__name__}")
    except ValueError:
        raise TelegramError("Telegramdan noto'g'ri javob keldi.")
    if not body.get("ok"):
        raise TelegramError(body.get("description") or "Telegram xatosi", retryable=False)
    return body.get("result")


def send_message(chat_id, text):
    return api_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text[:MAX_MESSAGE],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )
