"""Staff-side scoping of attempts (used by the Phase 3 results views). Public access is by token."""

from apps.core.scoping import scope_for

from .models import Attempt


def attempts_for(user):
    return scope_for(user, Attempt.objects.all())
