import secrets

from django.db import models

from apps.core.models import BaseModel


def new_access_token():
    """256 random bits, URL-safe. Doubles as the solve/result link secret (decision #24)."""
    return secrets.token_urlsafe(32)


class AttemptStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "Davom etmoqda"
    FINISHED = "finished", "Yakunlangan"
    EXPIRED = "expired", "Vaqti tugagan"


class Attempt(BaseModel):
    """
    One anonymous student's run of a test. Everything needed to show and grade the run is
    frozen in `AttemptItem.question_snapshot`, so later edits/deletes of the Test,
    Questions or Options never change a stored result (decision #25).
    """

    test = models.ForeignKey("content.Test", on_delete=models.PROTECT, related_name="attempts")
    # Denormalised from test.branch (same idea as Test.branch): cheap scoping for Phase 3.
    branch = models.ForeignKey(
        "branches.Branch", on_delete=models.PROTECT, related_name="attempts", editable=False
    )
    full_name = models.CharField(max_length=60)
    age = models.PositiveSmallIntegerField()
    access_token = models.CharField(max_length=64, unique=True, default=new_access_token, editable=False)
    # Random id from the `tp_device` cookie: how max_attempts is counted anonymously (decision #26).
    device_id = models.CharField(max_length=64, db_index=True)
    status = models.CharField(
        max_length=12, choices=AttemptStatus.choices, default=AttemptStatus.IN_PROGRESS, db_index=True
    )
    started_at = models.DateTimeField()
    deadline_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    seed = models.PositiveIntegerField()
    pass_percent = models.PositiveSmallIntegerField()  # frozen at start
    score = models.PositiveIntegerField(null=True, blank=True)
    max_score = models.PositiveIntegerField(null=True, blank=True)
    percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    # Set once the Telegram result notification went out (idempotency guard, decision #33).
    telegram_notified_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Urinish"
        verbose_name_plural = "Urinishlar"
        constraints = [
            # One live attempt per device and test, enforced by the database (race-proof).
            models.UniqueConstraint(
                fields=["test", "device_id"],
                condition=models.Q(status="in_progress"),
                name="one_active_attempt_per_device_test",
            ),
        ]
        indexes = [models.Index(fields=["test", "device_id"], name="attempt_test_device_idx")]

    def save(self, *args, **kwargs):
        self.branch_id = self.test.branch_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} - {self.test_id}"


class AttemptItem(BaseModel):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="items")
    question = models.ForeignKey("content.Question", on_delete=models.PROTECT, related_name="attempt_items")
    order = models.PositiveIntegerField()  # 1-based display position
    # {type, points, body_html, image_url, explanation_html,
    #  options: [{id, text_html, image_url, is_correct}]}  in DISPLAYED order.
    # is_correct lives here but must never reach the public API while in progress.
    question_snapshot = models.JSONField()
    selected_option_ids = models.JSONField(default=list)
    is_correct = models.BooleanField(null=True, blank=True)
    points_awarded = models.PositiveIntegerField(default=0)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "order"], name="attemptitem_unique_order"),
        ]
