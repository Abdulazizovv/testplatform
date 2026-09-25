"""
Anonymous student API under /api/v1/public/. Deliberately AllowAny with NO authentication
classes (decision #21): nothing here trusts a session, so CSRF protection has nothing to
protect; an attempt is authorised by its unguessable access token alone.
"""

import ipaddress
import re
import secrets

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import generics
from rest_framework.exceptions import NotFound, Throttled
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle
from rest_framework.views import APIView

from apps.content.scoping import public_branches, public_subjects, public_tests

from .models import AttemptStatus
from .serializers import (
    AnswerSerializer,
    AttemptStartSerializer,
    PublicBranchSerializer,
    PublicSubjectSerializer,
    PublicTestDetailSerializer,
    PublicTestSerializer,
    attempt_payload,
    result_payload,
)
from .services.lifecycle import (
    ANSWER_GRACE,
    AttemptError,
    finish_attempt,
    lock_attempt,
    save_answer,
    start_attempt,
)
from .throttles import (
    AttemptCreateThrottle,
    AttemptTokenThrottle,
    PublicAnswerThrottle,
    PublicReadThrottle,
)

DEVICE_COOKIE = "tp_device"
DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
_DEVICE_RE = re.compile(r"^[A-Za-z0-9_-]{20,64}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{20,64}$")
NOT_FOUND = "Topilmadi."


class PublicMixin:
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PublicReadThrottle]

    def throttled(self, request, wait):
        raise Throttled(wait, detail="Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring.")


def _not_found():
    return NotFound(NOT_FOUND)


def client_ip(request):
    ident = BaseThrottle().get_ident(request)
    try:
        return str(ipaddress.ip_address(ident))
    except ValueError:
        return None


# --- read-only catalogue -----------------------------------------------------------------


class BranchListView(PublicMixin, generics.ListAPIView):
    serializer_class = PublicBranchSerializer

    def get_queryset(self):
        return public_branches().order_by("name")


class BranchDetailView(PublicMixin, generics.RetrieveAPIView):
    serializer_class = PublicBranchSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return public_branches()


class BranchSubjectListView(PublicMixin, generics.ListAPIView):
    """Active subjects of one active branch that have at least one published test."""

    serializer_class = PublicSubjectSerializer

    def get_queryset(self):
        branch = public_branches().filter(slug=self.kwargs["slug"]).first()
        if branch is None:
            raise _not_found()
        return (
            public_subjects()
            .filter(branch=branch)
            .annotate(
                test_count=Count("tests", filter=Q(tests__in=public_tests().values("pk")), distinct=True)
            )
            .filter(test_count__gt=0)
            .order_by("name")
        )


class BranchSubjectDetailView(PublicMixin, APIView):
    def get(self, request, slug, subject_slug):
        subject = (
            public_subjects()
            .filter(branch__slug=slug, slug=subject_slug)
            .select_related("branch")
            .first()
        )
        if subject is None:
            raise _not_found()
        return Response(
            {
                **PublicSubjectSerializer(subject).data,
                "branch": PublicBranchSerializer(subject.branch).data,
            }
        )


class SubjectTestListView(PublicMixin, generics.ListAPIView):
    serializer_class = PublicTestSerializer

    def get_queryset(self):
        if not public_subjects().filter(pk=self.kwargs["pk"]).exists():
            raise _not_found()
        return public_tests().filter(subject_id=self.kwargs["pk"]).order_by("title", "created_at")


class TestDetailView(PublicMixin, generics.RetrieveAPIView):
    serializer_class = PublicTestDetailSerializer

    def get_queryset(self):
        return public_tests().select_related("subject", "branch")


# --- attempts -----------------------------------------------------------------------------


class NoStoreMixin:
    """Attempt data (questions, results) must never sit in a shared or browser cache."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class AttemptCreateView(NoStoreMixin, PublicMixin, APIView):
    throttle_classes = [PublicReadThrottle, AttemptCreateThrottle]

    def post(self, request, pk):
        serializer = AttemptStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = request.COOKIES.get(DEVICE_COOKIE, "")
        if not _DEVICE_RE.match(device):
            device = secrets.token_urlsafe(24)
        attempt, created = start_attempt(
            pk,
            full_name=serializer.validated_data["full_name"],
            age=serializer.validated_data["age"],
            device_id=device,
            ip=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
        )
        if attempt is None:
            raise _not_found()
        payload = {**attempt_payload(attempt), "resumed": not created}
        response = Response(payload, status=201 if created else 200)
        response.set_cookie(
            DEVICE_COOKIE,
            device,
            max_age=DEVICE_COOKIE_MAX_AGE,
            httponly=True,
            samesite="Lax",
            secure=bool(settings.SESSION_COOKIE_SECURE),
            path="/",
        )
        return response


class AttemptView(NoStoreMixin, PublicMixin, APIView):
    throttle_classes = [PublicReadThrottle, AttemptTokenThrottle]

    def _locked(self, token, grace=None):
        """Locked, expiry-applied attempt or 404. The lock is released when the caller's block ends."""
        if not _TOKEN_RE.match(token):
            raise _not_found()
        attempt = lock_attempt(token, grace) if grace else lock_attempt(token)
        if attempt is None:
            raise _not_found()
        return attempt


class AttemptDetailView(AttemptView):
    """State + questions (without correctness) while in progress; just the status afterwards."""

    def get(self, request, token):
        with transaction.atomic():
            attempt = self._locked(token)
            return Response(attempt_payload(attempt))


class AnswerView(AttemptView):
    throttle_classes = [PublicAnswerThrottle, AttemptTokenThrottle]

    def post(self, request, token):
        if not _TOKEN_RE.match(token):
            raise _not_found()
        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        error = None
        with transaction.atomic():
            attempt = self._locked(token, ANSWER_GRACE)
            items = attempt.items.all()
            item = (
                items.filter(pk=data["item_id"]).first()
                if "item_id" in data
                else items.filter(order=data["question_order"]).first()
            )
            if item is None:
                raise NotFound("Savol topilmadi.")
            try:
                save_answer(attempt, item, data["selected_option_ids"])
            except AttemptError as exc:
                error = exc  # raised after the block so a just-applied expiry is still committed
            answered = attempt.items.filter(answered_at__isnull=False).count()
        if error is not None:
            raise error
        timing = attempt_payload(attempt, include_items=False)
        return Response(
            {
                "saved": True,
                "item_id": str(item.id),
                "order": item.order,
                "selected_option_ids": item.selected_option_ids,
                "answered_count": answered,
                "remaining_sec": timing["remaining_sec"],
                "server_time": timing["server_time"],
            }
        )

    put = post


class FinishView(AttemptView):
    def post(self, request, token):
        with transaction.atomic():
            attempt = self._locked(token)
            finish_attempt(attempt)
            return Response(result_payload(attempt))


class ResultView(AttemptView):
    def get(self, request, token):
        with transaction.atomic():
            attempt = self._locked(token)
            if attempt.status == AttemptStatus.IN_PROGRESS:
                raise AttemptError("Test hali yakunlanmagan.", status_code=409)
            return Response(result_payload(attempt))
