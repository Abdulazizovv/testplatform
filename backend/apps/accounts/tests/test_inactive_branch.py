from django.core.cache import cache
from django.test import Client, TestCase

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.core.roles import Role

PASSWORD = "correct-horse-battery-1"
LOGIN = "/api/v1/auth/login/"


class InactiveBranchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.branch = Branch.objects.create(name="A", slug="a")
        cls.admin = User.objects.create_user("adm", password=PASSWORD, role=Role.ADMIN, branch=cls.branch)
        cls.teacher = User.objects.create_user("tch", password=PASSWORD, role=Role.TEACHER, branch=cls.branch)
        cls.root = User.objects.create_superuser("root", password=PASSWORD)

    def setUp(self):
        cache.clear()

    def login(self, client, username):
        client.get("/api/v1/auth/csrf/")
        return client.post(LOGIN, {"username": username, "password": PASSWORD}, content_type="application/json")

    def deactivate(self):
        Branch.objects.filter(pk=self.branch.pk).update(is_active=False)

    def test_staff_of_inactive_branch_cannot_login(self):
        self.deactivate()
        for name in ("adm", "tch"):
            r = self.login(Client(), name)
            self.assertEqual(r.status_code, 400, name)
            self.assertIn("Filialingiz faol emas", r.json()["detail"])

    def test_existing_session_rejected_after_deactivation(self):
        client = Client()
        self.assertEqual(self.login(client, "tch").status_code, 200)
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 200)
        self.deactivate()
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 403)
        # ...and every other API too (permission classes + scope_for)
        self.assertEqual(client.get("/api/v1/subjects/").status_code, 403)
        self.assertEqual(client.get("/api/v1/tests/").status_code, 403)

    def test_reactivating_branch_restores_access(self):
        client = Client()
        self.login(client, "adm")
        self.deactivate()
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 403)
        Branch.objects.filter(pk=self.branch.pk).update(is_active=True)
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 200)

    def test_superadmin_unaffected(self):
        self.deactivate()
        client = Client()
        self.assertEqual(self.login(client, "root").status_code, 200)
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 200)

    def test_active_branch_login_still_works(self):
        self.assertEqual(self.login(Client(), "adm").status_code, 200)
