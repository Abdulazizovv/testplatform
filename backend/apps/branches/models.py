from django.db import models

from apps.core.models import BaseModel


class Branch(BaseModel):
    """A school / tutoring-centre branch. The top-level tenant boundary."""

    name = models.CharField("Nomi", max_length=200)
    slug = models.SlugField("Slug", max_length=80, unique=True)
    address = models.CharField("Manzil", max_length=300, blank=True)
    is_active = models.BooleanField("Faol", default=True)
    # Optional Telegram chat for result notifications; empty -> the shared TELEGRAM_CHAT_ID.
    telegram_chat_id = models.CharField("Telegram chat ID", max_length=64, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Filial"
        verbose_name_plural = "Filiallar"

    def __str__(self):
        return self.name
