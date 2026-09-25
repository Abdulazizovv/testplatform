from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.core.roles import Role


class UserModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.branch = Branch.objects.create(name="A", slug="a")

    def test_admin_requires_branch(self):
        u = User(username="x", role=Role.ADMIN)
        with self.assertRaises(ValidationError):
            u.full_clean(exclude=["password"])

    def test_teacher_requires_branch(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user("t", password="x", role=Role.TEACHER)

    def test_superadmin_must_not_have_branch(self):
        u = User(username="s", role=Role.SUPERADMIN, branch=self.branch)
        with self.assertRaises(ValidationError):
            u.full_clean(exclude=["password"])
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user("s2", password="x", role=Role.SUPERADMIN, branch=self.branch)

    def test_staff_flags_follow_role(self):
        admin = User.objects.create_user("a", password="x", role=Role.ADMIN, branch=self.branch)
        self.assertFalse(admin.is_staff or admin.is_superuser)
        admin.is_staff = admin.is_superuser = True  # attempted escalation
        admin.save()
        admin.refresh_from_db()
        self.assertFalse(admin.is_staff or admin.is_superuser)

    def test_createsuperuser_gives_superadmin_role(self):
        call_command("createsuperuser", interactive=False, username="boss", verbosity=0)
        boss = User.objects.get(username="boss")
        self.assertEqual(boss.role, Role.SUPERADMIN)
        self.assertIsNone(boss.branch)
        self.assertTrue(boss.is_staff and boss.is_superuser)
