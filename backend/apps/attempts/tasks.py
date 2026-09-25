import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import Attempt
from .services import telegram

logger = logging.getLogger(__name__)

MAX_RETRIES = 5


@shared_task(bind=True, max_retries=MAX_RETRIES, ignore_result=True)
def notify_attempt_finished(self, attempt_id):
    """
    Send the Telegram result message once per attempt (decision #33). Idempotent: the
    attempt is "claimed" with a conditional UPDATE, so two tasks can never both send; a
    failed send releases the claim so a retry can go out. Never raises into the student flow.
    """
    attempt = Attempt.objects.select_related("test__subject", "branch").filter(pk=attempt_id).first()
    if attempt is None or attempt.finished_at is None or attempt.telegram_notified_at is not None:
        return
    chat_id = telegram.chat_id_for(attempt.branch)
    if not (chat_id and telegram.is_enabled()):
        return  # not configured: silently off
    claimed = Attempt.objects.filter(pk=attempt.pk, telegram_notified_at__isnull=True).update(
        telegram_notified_at=timezone.now()
    )
    if not claimed:
        return
    try:
        telegram.send_message(chat_id, telegram.build_message(attempt))
    except telegram.TelegramError as e:
        Attempt.objects.filter(pk=attempt.pk).update(telegram_notified_at=None)
        logger.warning("telegram notify failed attempt=%s reason=%s", attempt.pk, e)
        if e.retryable and self.request.retries < MAX_RETRIES:
            countdown = e.retry_after + 1 if e.retry_after else min(30 * 2**self.request.retries, 900)
            raise self.retry(countdown=countdown, exc=e)
    except Exception:  # noqa: BLE001 - a notification must never break anything
        Attempt.objects.filter(pk=attempt.pk).update(telegram_notified_at=None)
        logger.exception("telegram notify crashed attempt=%s", attempt.pk)


def enqueue_notification(attempt_id):
    """Queue the task after the surrounding transaction commits; swallow every failure."""
    if not telegram.is_enabled():
        return

    def _queue():
        try:
            notify_attempt_finished.delay(str(attempt_id))
        except Exception:  # noqa: BLE001 - broker down must not touch the student flow
            logger.exception("telegram enqueue failed attempt=%s", attempt_id)

    transaction.on_commit(_queue)
