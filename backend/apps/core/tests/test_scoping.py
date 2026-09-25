"""
Permission-layer tests. The key guarantee: a branch admin can NEVER see another
branch's data, and role permission classes admit only the intended roles.
"""

from django.contrib.auth.models import AnonymousUser
from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.scoping import branches_for, users_for
from apps.branches.models import Branch
from apps.core.permissions import (
    IsBranchAdmin,
    IsSameBranchOrSuperAdmin,
    IsStaffMember,
    IsSuperAdmin,
    IsSuperAdminOrBranchAdmin,
    IsTeacher,
)
from apps.core.roles import Role
from apps.core.scoping import scope_for


class World:
    """Two branches, each with an admin and a teacher, plus one superadmin."""

    @classmethod
    def build(cls):
        w = cls()
        w.a = Branch.objects.create(name="Filial A", slug="a")
        w.b = Branch.objects.create(name="Filial B", slug="b")
        w.root = User.objects.create_superuser("root", password="x-long-password-1")
        w.admin_a = User.objects.create_user("admin_a", password="x", role=Role.ADMIN, branch=w.a)
        w.admin_b = User.objects.create_user("admin_b", password="x", role=Role.ADMIN, branch=w.b)
        w.teacher_a = User.objects.create_user("teacher_a", password="x", role=Role.TEACHER, branch=w.a)
        w.teacher_a2 = User.objects.create_user("teacher_a2", password="x", role=Role.TEACHER, branch=w.a)
        w.teacher_b = User.objects.create_user("teacher_b", password="x", role=Role.TEACHER, branch=w.b)
        return w


class ScopeForTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.w = World.build()

    def test_superadmin_sees_all_branches_and_users(self):
        self.assertEqual(branches_for(self.w.root).count(), 2)
        self.assertEqual(users_for(self.w.root).count(), 6)

    def test_admin_sees_only_own_branch(self):
        self.assertEqual(list(branches_for(self.w.admin_a)), [self.w.a])
        self.assertNotIn(self.w.b, branches_for(self.w.admin_a))

    def test_admin_cannot_see_other_branch_users(self):
        visible = set(users_for(self.w.admin_a))
        self.assertEqual(visible, {self.w.admin_a, self.w.teacher_a, self.w.teacher_a2})
        self.assertFalse({self.w.admin_b, self.w.teacher_b} & visible)

    def test_teacher_sees_only_self(self):
        self.assertEqual(list(users_for(self.w.teacher_a)), [self.w.teacher_a])

    def test_teacher_sees_own_branch_only(self):
        self.assertEqual(list(branches_for(self.w.teacher_a)), [self.w.a])

    def test_anonymous_and_inactive_see_nothing(self):
        self.assertEqual(branches_for(AnonymousUser()).count(), 0)
        self.assertEqual(scope_for(None, User.objects.all()).count(), 0)
        self.w.admin_a.is_active = False
        self.w.admin_a.save()
        self.assertEqual(users_for(self.w.admin_a).count(), 0)

    def test_custom_branch_lookup(self):
        qs = scope_for(self.w.admin_b, User.objects.all(), branch_lookup="branch__slug")
        self.assertEqual(qs.count(), 0)  # lookup is compared against the branch *id*
        qs = scope_for(self.w.admin_b, User.objects.all(), branch_lookup="branch_id")
        self.assertEqual(set(qs), {self.w.admin_b, self.w.teacher_b})


class PermissionClassTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.w = World.build()
        cls.factory = APIRequestFactory()

    def _allowed(self, perm_cls, user):
        request = self.factory.get("/x/")
        if user is not None:
            force_authenticate(request, user=user)
        request = APIView().initialize_request(request)
        request.user = user if user is not None else AnonymousUser()
        return perm_cls().has_permission(request, None)

    def test_role_matrix(self):
        w = self.w
        matrix = {
            IsSuperAdmin: {w.root},
            IsBranchAdmin: {w.admin_a, w.admin_b},
            IsTeacher: {w.teacher_a, w.teacher_a2, w.teacher_b},
            IsSuperAdminOrBranchAdmin: {w.root, w.admin_a, w.admin_b},
            IsStaffMember: {w.root, w.admin_a, w.admin_b, w.teacher_a, w.teacher_a2, w.teacher_b},
        }
        everyone = list(User.objects.all())
        for perm, allowed in matrix.items():
            for user in everyone:
                self.assertEqual(
                    self._allowed(perm, user), user in allowed, f"{perm.__name__} / {user.username}"
                )
            self.assertFalse(self._allowed(perm, None), f"{perm.__name__} / anonymous")

    def test_inactive_user_denied(self):
        self.w.root.is_active = False
        self.assertFalse(self._allowed(IsSuperAdmin, self.w.root))

    def test_object_permission_blocks_other_branch(self):
        perm = IsSameBranchOrSuperAdmin()

        class View:
            branch_attr = "branch_id"

        def check(user, obj, attr="branch_id"):
            View.branch_attr = attr
            request = type("R", (), {"user": user})()
            return perm.has_object_permission(request, View, obj)

        self.assertTrue(check(self.w.admin_a, self.w.teacher_a))
        self.assertFalse(check(self.w.admin_a, self.w.teacher_b))
        self.assertTrue(check(self.w.root, self.w.teacher_b))
        # Branch object itself is keyed by "id"
        self.assertTrue(check(self.w.admin_a, self.w.a, attr="id"))
        self.assertFalse(check(self.w.admin_a, self.w.b, attr="id"))
        self.assertFalse(check(self.w.teacher_a, self.w.b, attr="id"))


class HealthzTests(TestCase):
    def test_healthz(self):
        response = self.client.get("/healthz/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
