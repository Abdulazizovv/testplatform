"""Staff-side scoping of attempts (results views). Public access is by token."""

from apps.core.roles import Role
from apps.core.scoping import scope_for

from .models import Attempt


def attempts_for(user):
    """Superadmin: all. Admin: own branch. Teacher: own branch AND only assigned subjects' tests."""
    qs = scope_for(user, Attempt.objects.all())
    if user.is_authenticated and user.role == Role.TEACHER:
        qs = qs.filter(test__subject__teachers=user)
    return qs
