from django.core.cache import cache
from django.test import Client, TestCase

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.core.roles import Role

PASSWORD = "correct-horse-battery-1"
LOGIN = "/api/v1/auth/login/"


class AuthApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.branch = Branch.objects.create(name="Filial A", slug="a")
        cls.teacher = User.objects.create_user(
            "teacher", password=PASSWORD, role=Role.TEACHER, branch=cls.branch, first_name="Ali"
        )

    def setUp(self):
        cache.clear()  # throttle counters
        self.client = Client(enforce_csrf_checks=True)

    def _csrf(self):
        response = self.client.get("/api/v1/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        return response.json()["csrfToken"]

    def _post(self, url, data=None, token=None):
        headers = {"HTTP_X_CSRFTOKEN": token} if token else {}
        return self.client.post(url, data or {}, content_type="application/json", **headers)

    def test_login_without_csrf_rejected(self):
        response = self._post(LOGIN, {"username": "teacher", "password": PASSWORD})
        self.assertEqual(response.status_code, 403)

    def test_login_me_logout_flow(self):
        token = self._csrf()
        response = self._post(LOGIN, {"username": "teacher", "password": PASSWORD}, token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["role"], "teacher")
        self.assertEqual(body["branch"]["slug"], "a")
        self.assertNotIn("password", body)

        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["username"], "teacher")

        token = self.client.cookies["csrftoken"].value  # rotated on login
        # logout needs CSRF too
        self.assertEqual(self._post("/api/v1/auth/logout/").status_code, 403)
        self.assertEqual(self._post("/api/v1/auth/logout/", token=token).status_code, 204)
        self.assertIn(self.client.get("/api/v1/auth/me/").status_code, (401, 403))

    def test_me_requires_login(self):
        self.assertIn(self.client.get("/api/v1/auth/me/").status_code, (401, 403))

    def test_wrong_password_is_generic_400(self):
        token = self._csrf()
        response = self._post(LOGIN, {"username": "teacher", "password": "nope"}, token)
        self.assertEqual(response.status_code, 400)
        unknown = self._post(LOGIN, {"username": "ghost", "password": "nope"}, token)
        self.assertEqual(response.json(), unknown.json())  # no user enumeration

    def test_inactive_user_cannot_login(self):
        User.objects.filter(pk=self.teacher.pk).update(is_active=False)
        token = self._csrf()
        response = self._post(LOGIN, {"username": "teacher", "password": PASSWORD}, token)
        self.assertEqual(response.status_code, 400)

    def test_missing_fields(self):
        token = self._csrf()
        self.assertEqual(self._post(LOGIN, {"username": "teacher"}, token).status_code, 400)

    def test_axes_locks_out_after_repeated_failures(self):
        token = self._csrf()
        for _ in range(5):
            self._post(LOGIN, {"username": "teacher", "password": "bad"}, token)
        # Even the correct password is refused while locked out.
        response = self._post(LOGIN, {"username": "teacher", "password": PASSWORD}, token)
        self.assertEqual(response.status_code, 429)

    def test_login_endpoint_is_throttled(self):
        token = self._csrf()
        codes = [
            self._post(LOGIN, {"username": f"u{i}", "password": "bad"}, token).status_code
            for i in range(12)
        ]
        self.assertIn(429, codes)

    def test_no_registration_endpoint(self):
        for url in ("/api/v1/auth/register/", "/api/v1/auth/signup/"):
            self.assertEqual(self.client.post(url).status_code, 404)
