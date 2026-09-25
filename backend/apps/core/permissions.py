"""
DRF permission classes. Role checks only - row-level filtering is scoping.py's job.
Use both: a permission class says *who may call the endpoint*, `scope_for` says *which
rows they get back*.
"""

from rest_framework.permissions import BasePermission

from apps.core.roles import Role


class _RolePermission(BasePermission):
    roles: tuple = ()
    message = "Sizda bu amalni bajarish uchun ruxsat yo'q."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_operational and user.role in self.roles
        )


class IsSuperAdmin(_RolePermission):
    roles = (Role.SUPERADMIN,)


class IsBranchAdmin(_RolePermission):
    roles = (Role.ADMIN,)


class IsTeacher(_RolePermission):
    roles = (Role.TEACHER,)


class IsSuperAdminOrBranchAdmin(_RolePermission):
    roles = (Role.SUPERADMIN, Role.ADMIN)


class IsStaffMember(_RolePermission):
    """Any logged-in platform user (superadmin, admin or teacher)."""

    roles = (Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)


class IsSameBranchOrSuperAdmin(BasePermission):
    """
    Object-level guard (defence in depth on top of scope_for): non-superadmins may only
    touch objects of their own branch. The view sets `branch_attr` to the object's
    branch-id attribute ("branch_id" by default, "id" for Branch itself).
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_operational)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == Role.SUPERADMIN:
            return True
        if user.branch_id is None:
            return False
        return getattr(obj, getattr(view, "branch_attr", "branch_id"), None) == user.branch_id
