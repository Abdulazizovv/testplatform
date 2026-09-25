"""
Public (anonymous) serializers. Hard rule: nothing here may emit `is_correct` or
`explanation` unless it is the result of a CLOSED attempt (`result_payload`). Payloads are
built from explicit whitelists, never by dumping a snapshot.
"""

import re

from django.utils import timezone
from rest_framework import serializers

from apps.branches.models import Branch
from apps.content.models import Subject, Test

from .models import AttemptStatus

NAME_SEPARATORS = " '’‘ʻʼ`-"


class PublicBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "slug", "name", "address")


class PublicSubjectSerializer(serializers.ModelSerializer):
    test_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Subject
        fields = ("id", "slug", "name", "description", "test_count")


class PublicTestSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Test
        fields = ("id", "title", "description_html", "question_count", "time_limit_sec", "pass_percent")


class PublicTestDetailSerializer(PublicTestSerializer):
    subject = PublicSubjectSerializer(read_only=True)
    branch = PublicBranchSerializer(read_only=True)

    class Meta(PublicTestSerializer.Meta):
        fields = PublicTestSerializer.Meta.fields + ("subject", "branch")


class AttemptStartSerializer(serializers.Serializer):
    full_name = serializers.CharField(
        max_length=60,
        error_messages={
            "required": "Ismingizni kiriting.",
            "blank": "Ismingizni kiriting.",
            "null": "Ismingizni kiriting.",
            "max_length": "Ism 2 dan 60 gacha belgidan iborat bo'lishi kerak.",
        },
    )
    age = serializers.IntegerField(
        min_value=4,
        max_value=100,
        error_messages={
            "required": "Yoshingizni kiriting.",
            "null": "Yoshingizni kiriting.",
            "invalid": "Yosh butun son bo'lishi kerak.",
            "min_value": "Yosh 4 dan 100 gacha bo'lishi kerak.",
            "max_value": "Yosh 4 dan 100 gacha bo'lishi kerak.",
        },
    )

    def validate_full_name(self, value):
        name = re.sub(r"\s+", " ", value).strip()
        letters = sum(ch.isalpha() for ch in name)
        if not 2 <= len(name) <= 60 or letters < 2:
            raise serializers.ValidationError("Ism 2 dan 60 gacha belgidan iborat bo'lishi kerak.")
        if not name[0].isalpha() or any(not (ch.isalpha() or ch in NAME_SEPARATORS) for ch in name):
            raise serializers.ValidationError(
                "Ismda faqat harflar, bo'sh joy, apostrof va tire bo'lishi mumkin."
            )
        return name


class AnswerSerializer(serializers.Serializer):
    item_id = serializers.UUIDField(required=False)
    question_order = serializers.IntegerField(required=False, min_value=1)
    selected_option_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=True, max_length=100
    )

    def validate(self, attrs):
        if ("item_id" in attrs) == ("question_order" in attrs):
            raise serializers.ValidationError("Savolni item_id yoki question_order bilan ko'rsating.")
        return attrs


# --- payload builders (plain dicts, explicit whitelists) --------------------------------


def _public_options(snapshot):
    return [
        {"id": o["id"], "text_html": o["text_html"], "image_url": o["image_url"]}
        for o in snapshot["options"]
    ]


def public_item(item):
    """A question as the student sees it during the test: no correctness, no explanation."""
    snap = item.question_snapshot
    return {
        "id": str(item.id),
        "order": item.order,
        "type": snap["type"],
        "points": snap["points"],
        "body_html": snap["body_html"],
        "image_url": snap["image_url"],
        "options": _public_options(snap),
        "selected_option_ids": item.selected_option_ids,
        "answered": bool(item.selected_option_ids),
    }


def _timing(attempt, now):
    remaining = None
    if attempt.deadline_at is not None:
        remaining = max(0, int((attempt.deadline_at - now).total_seconds()))
    return {
        "started_at": attempt.started_at,
        "deadline_at": attempt.deadline_at,
        "server_time": now,
        "remaining_sec": remaining,
    }


def attempt_payload(attempt, *, include_items=True):
    now = timezone.now()
    test = attempt.test
    data = {
        "access_token": attempt.access_token,
        "status": attempt.status,
        "full_name": attempt.full_name,
        "age": attempt.age,
        "test": {"id": str(test.id), "title": test.title, "time_limit_sec": test.time_limit_sec},
        **_timing(attempt, now),
    }
    if include_items and attempt.status == AttemptStatus.IN_PROGRESS:
        items = [public_item(i) for i in attempt.items.all()]
        data["items"] = items
        data["question_count"] = len(items)
        data["answered_count"] = sum(1 for i in items if i["answered"])
    return data


def result_payload(attempt):
    """Result of a CLOSED attempt, shaped by Test.result_visibility (read live from the test)."""
    test = attempt.test
    visibility = test.result_visibility
    data = {
        "status": attempt.status,
        "test": {"id": str(test.id), "title": test.title},
        "full_name": attempt.full_name,
        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,
        "result_visibility": visibility,
    }
    if visibility in ("score", "full"):
        data.update(
            score=attempt.score,
            max_score=attempt.max_score,
            percent=float(attempt.percent),
            passed=attempt.passed,
            pass_percent=attempt.pass_percent,
        )
    if visibility == "full":
        data["items"] = [_review_item(i) for i in attempt.items.all()]
    return data


def _review_item(item):
    snap = item.question_snapshot
    chosen = set(item.selected_option_ids)
    return {
        "order": item.order,
        "type": snap["type"],
        "points": snap["points"],
        "points_awarded": item.points_awarded,
        "answered": bool(chosen),
        "is_correct": bool(item.is_correct),
        "body_html": snap["body_html"],
        "image_url": snap["image_url"],
        "explanation_html": snap["explanation_html"],
        "options": [
            {
                "id": o["id"],
                "text_html": o["text_html"],
                "image_url": o["image_url"],
                "is_correct": o["is_correct"],
                "selected": o["id"] in chosen,
            }
            for o in snap["options"]
        ],
    }
