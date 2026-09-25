import uuid

from django.db import transaction
from django.db.models import Count
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.scoping import branches_for
from apps.core.permissions import IsStaffMember, IsSuperAdminOrBranchAdmin
from apps.core.roles import Role

from .models import Question, TestStatus
from .scoping import media_for, questions_for, subjects_for, tests_for
from .serializers import (
    MediaAssetSerializer,
    MediaUploadSerializer,
    QuestionReorderSerializer,
    QuestionSerializer,
    SubjectCloneSerializer,
    SubjectSerializer,
    TestDuplicateSerializer,
    TestSerializer,
)
from .services.errors import ContentError
from .services.media import store_upload
from .services.subjects import clone_subject, duplicate_test
from .services.validation import assert_test_publishable


def _uuid_or_none(value):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


class SubjectViewSet(viewsets.ModelViewSet):
    """Everyone on staff may read (teachers: only assigned subjects); writes: admin/superadmin."""

    serializer_class = SubjectSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsStaffMember()]
        return [IsSuperAdminOrBranchAdmin()]

    def get_queryset(self):
        qs = subjects_for(self.request.user).select_related("branch")
        qs = qs.annotate(test_count=Count("tests", distinct=True)).order_by("name", "created_at")
        params = self.request.query_params
        if _uuid_or_none(params.get("branch")):
            qs = qs.filter(branch_id=params["branch"])
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        return qs

    def destroy(self, request, *args, **kwargs):
        subject = self.get_object()
        if subject.tests.exists():
            raise ContentError(
                "Fanda testlar bor. Avval testlarni o'chiring yoki fanni faolsizlantiring.",
                status_code=status.HTTP_409_CONFLICT,
            )
        subject.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def clone(self, request, pk=None):
        """Deep copy (tests, questions, options, media) as drafts. Cross-branch: superadmin only."""
        subject = self.get_object()
        serializer = SubjectCloneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_id = serializer.validated_data["target_branch"]
        user = request.user
        if user.role != Role.SUPERADMIN and target_id != user.branch_id:
            raise PermissionDenied("Filiallararo nusxani faqat superadmin qila oladi.")
        target = branches_for(user).filter(pk=target_id).first()
        if target is None:
            raise ContentError("Filial topilmadi.")
        new_subject = clone_subject(subject, target, user, serializer.validated_data.get("name"))
        new_subject = self.get_queryset().get(pk=new_subject.pk)
        data = SubjectSerializer(new_subject, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)


class TestViewSet(viewsets.ModelViewSet):
    """
    Teacher: every test of the subjects assigned to them (decision #13). Admin: whole branch.
    Statuses change only through publish/unpublish/archive.
    """

    permission_classes = [IsStaffMember]
    serializer_class = TestSerializer

    def get_queryset(self):
        qs = tests_for(self.request.user).select_related("subject", "author")
        qs = qs.annotate(question_count=Count("questions", distinct=True)).order_by("-created_at")
        params = self.request.query_params
        if params.get("subject"):
            qs = qs.filter(subject_id=_uuid_or_none(params["subject"]))
        if params.get("status") in TestStatus.values:
            qs = qs.filter(status=params["status"])
        if params.get("search", "").strip():
            qs = qs.filter(title__icontains=params["search"].strip())
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def destroy(self, request, *args, **kwargs):
        test = self.get_object()
        user = request.user
        if user.role == Role.TEACHER and test.author_id != user.id:
            raise PermissionDenied("O'qituvchi faqat o'zi yaratgan testni o'chira oladi.")
        if test.status == TestStatus.PUBLISHED:
            raise ContentError("E'lon qilingan testni o'chirib bo'lmaydi. Avval e'londan olib tashlang.")
        if test.attempts.exists():
            raise ContentError(
                "Testni o'chirib bo'lmaydi: uni topshirgan o'quvchilar natijalari bor. "
                "O'rniga arxivlang.",
                status_code=status.HTTP_409_CONFLICT,
            )
        test.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _respond(self, test):
        test = self.get_queryset().get(pk=test.pk)
        return Response(self.get_serializer(test).data)

    def _set_status(self, new_status):
        test = self.get_object()
        if new_status == TestStatus.PUBLISHED:
            assert_test_publishable(test)
        elif new_status == TestStatus.DRAFT and test.status != TestStatus.PUBLISHED:
            raise ContentError("Faqat e'lon qilingan testni qoralamaga qaytarish mumkin.")
        test.status = new_status
        test.save(update_fields=["status", "updated_at"])
        return self._respond(test)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._set_status(TestStatus.PUBLISHED)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        return self._set_status(TestStatus.DRAFT)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._set_status(TestStatus.ARCHIVED)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Copy as a draft into the same subject, or another subject of the same branch."""
        test = self.get_object()
        serializer = TestDuplicateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        subject = serializer.validated_data.get("subject") or test.subject
        if subject.branch_id != test.branch_id:
            raise ContentError("Testni faqat shu filial ichida nusxalash mumkin.")
        copy = duplicate_test(test, subject, request.user, serializer.validated_data.get("title"))
        return Response(self.get_serializer(self.get_queryset().get(pk=copy.pk)).data, status=201)

    @action(detail=True, methods=["get", "post"], url_path="questions")
    def questions(self, request, pk=None):
        test = self.get_object()
        context = {**self.get_serializer_context(), "test": test}
        if request.method == "POST":
            serializer = QuestionSerializer(data=request.data, context=context)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=201)
        qs = test.questions.select_related("image").prefetch_related("options__image")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(QuestionSerializer(page, many=True, context=context).data)

    @action(detail=True, methods=["post"], url_path="questions/reorder")
    def reorder(self, request, pk=None):
        test = self.get_object()
        serializer = QuestionReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["order"]
        with transaction.atomic():
            questions = {q.id: q for q in test.questions.select_for_update()}
            if len(ids) != len(set(ids)) or set(ids) != set(questions):
                raise ContentError(
                    "Ro'yxat testning barcha savollarini aynan bir marta o'z ichiga olishi kerak."
                )
            for position, qid in enumerate(ids):
                questions[qid].order = position
            Question.objects.bulk_update(questions.values(), ["order"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuestionViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Detail access to one question (create/list live under /tests/{id}/questions/)."""

    permission_classes = [IsStaffMember]
    serializer_class = QuestionSerializer

    def get_queryset(self):
        return (
            questions_for(self.request.user)
            .select_related("test", "image")
            .prefetch_related("options__image")
        )

    def get_serializer(self, *args, **kwargs):
        if args and isinstance(args[0], Question):
            kwargs["context"] = {**self.get_serializer_context(), "test": args[0].test}
        return super().get_serializer(*args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        question = self.get_object()
        test = question.test
        if test.status == TestStatus.PUBLISHED and test.questions.count() <= 1:
            raise ContentError("E'lon qilingan testning oxirgi savolini o'chirib bo'lmaydi.")
        if question.attempt_items.exists():
            raise ContentError(
                "Savolni o'chirib bo'lmaydi: u o'quvchilar natijalarida qatnashgan. "
                "Uni tahrirlash mumkin (eski natijalar o'zgarmaydi).",
                status_code=status.HTTP_409_CONFLICT,
            )
        question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MediaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Image upload (multipart field `file`) and read. Only the user's own branch."""

    permission_classes = [IsStaffMember]
    serializer_class = MediaAssetSerializer
    parser_classes = [MultiPartParser]

    def get_queryset(self):
        return media_for(self.request.user)

    def create(self, request):
        serializer = MediaUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if user.role == Role.SUPERADMIN:
            branch = serializer.validated_data.get("branch_id")
            if branch is None:
                raise ContentError("Filialni ko'rsating (branch_id).")
        else:
            branch = user.branch  # never taken from the request
        asset, created = store_upload(serializer.validated_data["file"], branch=branch, user=user)
        return Response(
            MediaAssetSerializer(asset).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
