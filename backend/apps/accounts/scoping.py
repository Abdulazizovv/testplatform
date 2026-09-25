"""Model-specific scoping helpers built on core.scoping.scope_for."""

from apps.branches.models import Branch
from apps.core.roles import Role
from apps.core.scoping import scope_for

from .models import User


def branches_for(user):
    """Superadmin: all branches. Admin/teacher: only their own."""
    return scope_for(user, Branch.objects.all(), branch_lookup="id")


def users_for(user):
    """
    Superadmin: all users. Branch admin: users of their own branch.
    Teacher: only themselves (colleagues' accounts are not their business).
    """
    qs = scope_for(user, User.objects.all(), branch_lookup="branch_id")
    if user.is_authenticated and user.role == Role.TEACHER:
        qs = qs.filter(pk=user.pk)
    return qs
