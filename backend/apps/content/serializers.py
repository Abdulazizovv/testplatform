from rest_framework import serializers

from apps.accounts.serializers import BranchBriefSerializer
from apps.branches.models import Branch
from apps.core.roles import Role

from .models import MediaAsset, Option, Question, QuestionType, Subject, Test
from .scoping import media_for, subjects_for
from .services.questions import save_question
from .services.sanitize import media_names_in
from .services.subjects import unique_slug


def _request_user(serializer):
    return serializer.context["request"].user


def _check_media_refs(user, branch_id, *texts):
    """Every /media/... file mentioned inside rich text must belong to `branch_id`."""
    names = set()
    for text in texts:
        names |= media_names_in(text)
    if not names:
        return
    found = media_for(user).filter(branch_id=branch_id, file__in=names).count()
    if found != len(names):
        raise serializers.ValidationError("Matnda mavjud bo'lmagan yoki begona rasm havolasi bor.")


class ScopedSubjectField(serializers.PrimaryKeyRelatedField):
    """Only subjects the requesting user may use; foreign and unknown ids look identical."""

    default_error_messages = {"does_not_exist": "Fan topilmadi.", "incorrect_type": "Fan topilmadi."}

    def get_queryset(self):
        return subjects_for(self.context["request"].user)


class ScopedMediaField(serializers.PrimaryKeyRelatedField):
    default_error_messages = {
        "does_not_exist": "Bunday rasm topilmadi.",
        "incorrect_type": "Bunday rasm topilmadi.",
    }

    def get_queryset(self):
        return media_for(self.context["request"].user)


def _check_asset(user, branch_id, asset):
    if asset is not None and not media_for(user).filter(pk=asset.pk, branch_id=branch_id).exists():
        raise serializers.ValidationError("Bunday rasm topilmadi.")
    return asset


# --- Subject -------------------------------------------------------------------------


class SubjectSerializer(serializers.ModelSerializer):
    branch = BranchBriefSerializer(read_only=True)
    # Only honoured for a superadmin creating a subject. Branch admins always get their
    # own branch; the value is never trusted from them. Immutable after creation.
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch", queryset=Branch.objects.all(), write_only=True, required=False
    )
    slug = serializers.SlugField(max_length=80, required=False)
    test_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Subject
        fields = (
            "id", "branch", "branch_id", "name", "slug", "description", "is_active",
            "test_count", "created_at", "updated_at",
        )  # fmt: skip
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []  # (branch, slug) uniqueness is checked in validate(); the branch isn't a plain field

    def validate(self, attrs):
        user = _request_user(self)
        if self.instance is None:
            if user.role == Role.SUPERADMIN:
                if attrs.get("branch") is None:
                    raise serializers.ValidationError({"branch_id": "Filialni ko'rsating."})
            else:
                attrs["branch"] = user.branch
            branch, exclude = attrs["branch"], None
        else:
            attrs.pop("branch", None)
            branch, exclude = self.instance.branch, self.instance.pk

        slug = attrs.get("slug")
        if slug is None and self.instance is None:
            attrs["slug"] = unique_slug(branch, attrs.get("name", ""))
        elif slug is not None:
            clash = Subject.objects.filter(branch=branch, slug=slug)
            if exclude:
                clash = clash.exclude(pk=exclude)
            if clash.exists():
                raise serializers.ValidationError({"slug": "Bu slug shu filialda band."})
        return attrs


class SubjectCloneSerializer(serializers.Serializer):
    # Resolved in the view, after the permission check, so a branch admin can't probe
    # which foreign branch ids exist.
    target_branch = serializers.UUIDField()
    name = serializers.CharField(max_length=200, required=False, allow_blank=False)


# --- Media ---------------------------------------------------------------------------


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)

    class Meta:
        model = MediaAsset
        fields = ("id", "branch", "url", "mime", "width", "height", "size", "created_at")
        read_only_fields = fields


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    branch_id = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.all(), required=False, write_only=True
    )


# --- Test ----------------------------------------------------------------------------


class TestSerializer(serializers.ModelSerializer):
    __test__ = False

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    author_name = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(read_only=True, default=0)
    subject = ScopedSubjectField()

    class Meta:
        model = Test
        fields = (
            "id", "subject", "subject_name", "branch", "author", "author_name", "title",
            "description_src", "description_html", "status", "time_limit_sec", "pass_percent",
            "shuffle_questions", "shuffle_options", "result_visibility", "max_attempts",
            "question_count", "created_at", "updated_at",
        )  # fmt: skip
        read_only_fields = (
            "id", "branch", "author", "description_html", "status", "created_at", "updated_at",
        )  # fmt: skip
        extra_kwargs = {
            "time_limit_sec": {"min_value": 1},
            "max_attempts": {"min_value": 1},
            "pass_percent": {"min_value": 0, "max_value": 100},
        }

    def get_author_name(self, obj):
        return obj.author.username if obj.author else None

    def validate_subject(self, subject):
        if self.instance is not None and subject.branch_id != self.instance.branch_id:
            raise serializers.ValidationError("Testni boshqa filial faniga ko'chirib bo'lmaydi.")
        return subject

    def validate(self, attrs):
        subject = attrs.get("subject") or (self.instance.subject if self.instance else None)
        if "description_src" in attrs and subject is not None:
            _check_media_refs(_request_user(self), subject.branch_id, attrs["description_src"])
        return attrs


class TestDuplicateSerializer(serializers.Serializer):
    subject = ScopedSubjectField(required=False)
    title = serializers.CharField(max_length=250, required=False)


# --- Question / options -----------------------------------------------------------------


class OptionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    image = ScopedMediaField(allow_null=True, required=False)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Option
        fields = ("id", "order", "text_src", "text_html", "image", "image_url", "is_correct")
        read_only_fields = ("order", "text_html")

    def get_image_url(self, obj):
        return obj.image.url if obj.image_id else None

    def validate_image(self, asset):
        test = self.context["test"]
        return _check_asset(_request_user(self), test.branch_id, asset)


class QuestionSerializer(serializers.ModelSerializer):
    options = OptionSerializer(many=True, required=False)
    image = ScopedMediaField(allow_null=True, required=False)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = (
            "id", "test", "order", "type", "body_format", "body_src", "body_html", "image",
            "image_url", "explanation", "explanation_html", "points", "options",
            "created_at", "updated_at",
        )  # fmt: skip
        read_only_fields = (
            "id", "test", "order", "body_html", "explanation_html", "created_at", "updated_at",
        )  # fmt: skip
        extra_kwargs = {"points": {"min_value": 1}}

    def get_image_url(self, obj):
        return obj.image.url if obj.image_id else None

    def validate_type(self, value):
        if value == QuestionType.TEXT:
            raise serializers.ValidationError("Yoziladigan savollar keyingi bosqichda.")
        return value

    def validate_image(self, asset):
        return _check_asset(_request_user(self), self.context["test"].branch_id, asset)

    def validate(self, attrs):
        test = self.context["test"]
        _check_media_refs(
            _request_user(self), test.branch_id,
            attrs.get("body_src"), attrs.get("explanation"),
            *[o.get("text_src") for o in attrs.get("options", [])],
        )  # fmt: skip
        return attrs

    def create(self, validated_data):
        question = save_question(self.context["test"], validated_data)
        return self._fresh(question)

    def update(self, instance, validated_data):
        question = save_question(self.context["test"], validated_data, instance)
        return self._fresh(question)

    @staticmethod
    def _fresh(question):
        return Question.objects.prefetch_related("options__image").select_related("image").get(pk=question.pk)


class QuestionReorderSerializer(serializers.Serializer):
    order = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
