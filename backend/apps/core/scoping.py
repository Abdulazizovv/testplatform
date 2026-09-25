"""
Centralised row-level scoping. THE single place that decides which rows a user may see.

Rule: every queryset returned from an API view goes through `scope_for` (or a
model-specific helper built on it, e.g. accounts.scoping.users_for). Views must never
hand-roll `filter(branch=...)` checks - that is how cross-branch leaks happen.

    superadmin        -> everything
    admin / teacher   -> only rows of their own branch
    anonymous/inactive/no-branch/inactive-branch -> nothing
"""

from apps.core.roles import Role


def scope_for(user, queryset, branch_lookup="branch_id"):
    """
    Restrict `queryset` to rows the user may access.

    `branch_lookup` is the ORM path to the owning branch's id: "branch_id" for models
    with a `branch` FK (default), "id" for Branch itself, "subject__branch_id" for
    rows that inherit their branch through a relation, etc.
    """
    if user is None or not user.is_authenticated or not user.is_operational:
        return queryset.none()
    if user.role == Role.SUPERADMIN:
        return queryset
    if user.role in (Role.ADMIN, Role.TEACHER) and user.branch_id is not None:
        return queryset.filter(**{branch_lookup: user.branch_id})
    return queryset.none()
