import re

from rest_framework import serializers

from apps.core.roles import Role

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    """`telegram_chat_id` is superadmin-only: hidden from other roles; writes are superadmin-only anyway."""

    class Meta:
        model = Branch
        fields = (
            "id", "name", "slug", "address", "is_active", "telegram_chat_id", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_telegram_chat_id(self, value):
        value = value.strip()
        if value and not re.fullmatch(r"-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,63}", value):
            raise serializers.ValidationError(
                "Chat ID raqam (masalan -1001234567890) yoki @kanal_nomi bo'lishi kerak."
            )
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        user = getattr(self.context.get("request"), "user", None)
        if user is None or getattr(user, "role", None) != Role.SUPERADMIN:
            data.pop("telegram_chat_id", None)
        return data
