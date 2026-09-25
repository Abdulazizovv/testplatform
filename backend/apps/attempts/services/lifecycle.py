"""Attempt life cycle: start, autosave answers, finish, lazy expiry. All timing is server-side."""

import secrets
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.content.scoping import public_tests
from apps.core.exceptions import BusinessError

from ..models import Attempt, AttemptItem, AttemptStatus
from ..tasks import enqueue_notification
from .grading import grade_item, summarize
from .snapshot import build_snapshots

# A save already in flight when the deadline passes is still accepted for a moment
# (network latency); grading only ever uses what the server stored.
ANSWER_GRACE = timedelta(seconds=3)


class AttemptError(BusinessError):
    pass


def lock_attempt(token, grace=timedelta(0)):
    """
    Row-locked attempt by token (None if unknown), expiry applied. Use inside atomic().
    `grace` postpones expiry slightly; only the autosave endpoint passes ANSWER_GRACE.
    """
    attempt = (
        Attempt.objects.select_for_update(of=("self",))
        .select_related("test")
        .filter(access_token=token)
        .first()
    )
    if attempt is not None:
        expire_if_due(attempt, timezone.now() - grace)
    return attempt


def finalize(attempt, status, finished_at):
    """Grade every item from what is stored and close the attempt."""
    items = list(attempt.items.all())
    score = max_score = 0
    for item in items:
        snap = item.question_snapshot
        max_score += snap["points"]
        item.is_correct, item.points_awarded = grade_item(snap, item.selected_option_ids)
        score += item.points_awarded
    AttemptItem.objects.bulk_update(items, ["is_correct", "points_awarded"])
    attempt.score, attempt.max_score = score, max_score
    attempt.percent, attempt.passed = summarize(score, max_score, attempt.pass_percent)
    attempt.status = status
    attempt.finished_at = finished_at
    attempt.save()
    enqueue_notification(attempt.pk)  # after commit; once per attempt (task is idempotent)


def expire_if_due(attempt, now=None):
    now = now or timezone.now()
    if attempt.status == AttemptStatus.IN_PROGRESS and attempt.deadline_at and now >= attempt.deadline_at:
        finalize(attempt, AttemptStatus.EXPIRED, attempt.deadline_at)
        return True
    return False


def start_attempt(test_id, *, full_name, age, device_id, ip, user_agent):
    """
    Returns (attempt, created); (None, False) when the test is not publicly visible.
    Order of rules: a still running attempt of this device+test is resumed when the name
    matches, else refused (409); max_attempts counts attempts per device (decision #26).
    """
    test = public_tests().filter(pk=test_id).first()
    if test is None:
        return None, False
    now = timezone.now()
    with transaction.atomic():
        running = list(
            Attempt.objects.select_for_update().filter(
                test=test, device_id=device_id, status=AttemptStatus.IN_PROGRESS
            )
        )
        for attempt in running:
            expire_if_due(attempt, now)
            if attempt.status != AttemptStatus.IN_PROGRESS:
                continue
            if attempt.full_name.casefold() == full_name.casefold():
                return attempt, False
            raise AttemptError(
                "Bu qurilmada shu testning tugallanmagan urinishi bor. Avval uni yakunlang.",
                errors=[{"access_token": attempt.access_token}],
                status_code=409,
            )
        if test.max_attempts is not None:
            used = Attempt.objects.filter(test=test, device_id=device_id).count()
            if used >= test.max_attempts:
                raise AttemptError(
                    f"Bu testni shu qurilmadan {test.max_attempts} martadan ortiq topshirib bo'lmaydi.",
                    status_code=403,
                )
        seed = secrets.randbelow(2**31)
        snapshots = build_snapshots(test, seed)
        if not snapshots:
            raise AttemptError("Testda savollar yo'q.", status_code=409)
        try:
            with transaction.atomic():
                attempt = Attempt(
                    test=test,
                    full_name=full_name,
                    age=age,
                    device_id=device_id,
                    started_at=now,
                    deadline_at=now + timedelta(seconds=test.time_limit_sec) if test.time_limit_sec else None,
                    seed=seed,
                    pass_percent=test.pass_percent,
                    ip=ip,
                    user_agent=user_agent,
                )
                attempt.save()
                AttemptItem.objects.bulk_create(
                    AttemptItem(attempt=attempt, question=q, order=i, question_snapshot=snap)
                    for i, (q, snap) in enumerate(snapshots, start=1)
                )
        except IntegrityError:  # two simultaneous starts from one device
            raise AttemptError("Bu qurilmada shu testning tugallanmagan urinishi bor.", status_code=409)
    return attempt, True


def save_answer(attempt, item, selected_ids, now=None):
    """Idempotent autosave. `attempt` must be locked and already expiry-checked."""
    now = now or timezone.now()
    if attempt.status == AttemptStatus.EXPIRED:
        raise AttemptError("Test vaqti tugagan.", status_code=410)
    if attempt.status == AttemptStatus.FINISHED:
        raise AttemptError("Test yakunlangan, javobni o'zgartirib bo'lmaydi.", status_code=409)
    snap = item.question_snapshot
    valid = {o["id"] for o in snap["options"]}
    chosen = [str(s) for s in dict.fromkeys(selected_ids)]  # unique, order kept
    if not set(chosen) <= valid:
        raise AttemptError("Noto'g'ri variant tanlandi.")
    if snap["type"] == "single" and len(chosen) > 1:
        raise AttemptError("Bu savolda faqat bitta variant tanlash mumkin.")
    chosen.sort()
    item.selected_option_ids = chosen
    item.answered_at = now if chosen else None
    item.save(update_fields=["selected_option_ids", "answered_at", "updated_at"])
    return item


def finish_attempt(attempt, now=None):
    """Idempotent: finishing a closed attempt changes nothing."""
    if attempt.status == AttemptStatus.IN_PROGRESS:
        finalize(attempt, AttemptStatus.FINISHED, now or timezone.now())
    return attempt
