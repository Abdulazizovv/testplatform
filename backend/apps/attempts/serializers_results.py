"""Staff result serializers. Staff may see answers, so unlike the public ones these carry is_correct."""

from rest_framework import serializers

from .models import Attempt
from .services.formatting import attempt_duration_sec


class AttemptListSerializer(serializers.ModelSerializer):
    test = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    duration_sec = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = (
            "id", "full_name", "age", "test", "subject", "branch", "status", "score", "max_score",
            "percent", "passed", "pass_percent", "started_at", "finished_at", "duration_sec",
        )

    def get_test(self, a):
        return {"id": a.test_id, "title": a.test.title}

    def get_subject(self, a):
        return {"id": a.test.subject_id, "name": a.test.subject.name}

    def get_branch(self, a):
        return {"id": a.branch_id, "name": a.branch.name}

    def get_duration_sec(self, a):
        return attempt_duration_sec(a)


class AttemptDetailSerializer(AttemptListSerializer):
    items = serializers.SerializerMethodField()

    class Meta(AttemptListSerializer.Meta):
        fields = AttemptListSerializer.Meta.fields + ("items",)

    def get_items(self, a):
        out = []
        for item in a.items.all():  # prefetched, ordered by `order`
            snap = item.question_snapshot
            chosen = set(item.selected_option_ids or [])
            out.append(
                {
                    "order": item.order,
                    "type": snap.get("type"),
                    "points": snap.get("points"),
                    "points_awarded": item.points_awarded,
                    "answered": bool(chosen),
                    "is_correct": item.is_correct,
                    "body_html": snap.get("body_html", ""),
                    "image_url": snap.get("image_url"),
                    "explanation_html": snap.get("explanation_html", ""),
                    "options": [
                        {
                            "id": o["id"],
                            "text_html": o.get("text_html", ""),
                            "image_url": o.get("image_url"),
                            "is_correct": o["is_correct"],
                            "selected": o["id"] in chosen,
                        }
                        for o in snap.get("options", [])
                    ],
                }
            )
        return out
