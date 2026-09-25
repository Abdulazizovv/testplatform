"""Content scoping helpers built on core.scoping.scope_for (teacher = assigned subjects only)."""

from django.db.models import Count

from apps.branches.models import Branch
from apps.core.roles import Role
from apps.core.scoping import scope_for

from .models import MediaAsset, Question, Subject, Test


def _is_teacher(user):
    return user.is_authenticated and user.role == Role.TEACHER


def subjects_for(user):
    qs = scope_for(user, Subject.objects.all())
    if _is_teacher(user):
        qs = qs.filter(teachers=user)
    return qs


def tests_for(user):
    qs = scope_for(user, Test.objects.all())
    if _is_teacher(user):
        qs = qs.filter(subject__teachers=user)
    return qs


def questions_for(user):
    qs = scope_for(user, Question.objects.all(), branch_lookup="test__branch_id")
    if _is_teacher(user):
        qs = qs.filter(test__subject__teachers=user)
    return qs


def media_for(user):
    return scope_for(user, MediaAsset.objects.all())


# --- Public (anonymous student) visibility: the ONE definition of "what students may see" ---


def public_branches():
    return Branch.objects.filter(is_active=True)


def public_subjects():
    return Subject.objects.filter(is_active=True, branch__is_active=True)


def public_tests():
    """Published tests with at least one question, in active subjects of active branches."""
    return (
        Test.objects.filter(status="published", subject__is_active=True, branch__is_active=True)
        .annotate(question_count=Count("questions", distinct=True))
        .filter(question_count__gt=0)
    )
