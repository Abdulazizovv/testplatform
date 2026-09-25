from apps.accounts.models import User
from apps.branches.models import Branch
from apps.content.tests.helpers import PASSWORD, ContentAPITestCase
from apps.core.roles import Role

API = "/api/v1"
NEW_PASSWORD = "a-Fresh-passw0rd-42"


def payload(**kw):
    base = {"username": "newbie", "password": NEW_PASSWORD, "role": "teacher", "first_name": "Ali"}
    base.update(kw)
    return base


class UserManagementTests(ContentAPITestCase):
    def test_admin_creates_teacher_in_own_branch_with_subjects(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(
            f"{API}/users/",
            payload(subjects=[str(self.subj_a1.id), str(self.subj_a2.id)]),
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn("password", r.json())
        user = User.objects.get(username="newbie")
        self.assertEqual((user.role, user.branch_id), (Role.TEACHER, self.a.id))
        self.assertTrue(user.check_password(NEW_PASSWORD))
        self.assertEqual(set(user.subjects.all()), {self.subj_a1, self.subj_a2})
        self.assertFalse(user.is_staff or user.is_superuser)

    def test_admin_creates_admin_in_own_branch(self):
        r = self.as_user(self.admin_a).post(f"{API}/users/", payload(role="admin"), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(User.objects.get(username="newbie").branch_id, self.a.id)

    def test_admin_cannot_choose_another_branch(self):
        r = self.as_user(self.admin_a).post(f"{API}/users/", payload(branch_id=str(self.b.id)), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="newbie").branch_id, self.a.id)  # body value ignored

    def test_admin_cannot_create_superadmin(self):
        for extra in ({"role": "superadmin"}, {"role": "superadmin", "branch_id": str(self.a.id)}):
            r = self.as_user(self.admin_a).post(f"{API}/users/", payload(**extra), format="json")
            self.assertEqual(r.status_code, 403)
        self.assertFalse(User.objects.filter(username="newbie").exists())

    def test_admin_cannot_assign_foreign_or_unknown_subjects(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(f"{API}/users/", payload(subjects=[str(self.subj_b1.id)]), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(User.objects.filter(username="newbie").exists())
        r = admin.post(f"{API}/users/", payload(subjects=["00000000-0000-4000-8000-000000000000"]), format="json")
        self.assertEqual(r.status_code, 400)

    def test_subjects_only_for_teachers(self):
        r = self.as_user(self.admin_a).post(
            f"{API}/users/", payload(role="admin", subjects=[str(self.subj_a1.id)]), format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_superadmin_subject_must_match_teacher_branch(self):
        root = self.as_user(self.root)
        r = root.post(
            f"{API}/users/", payload(branch_id=str(self.b.id), subjects=[str(self.subj_a1.id)]), format="json"
        )
        self.assertEqual(r.status_code, 400)
        r = root.post(
            f"{API}/users/", payload(branch_id=str(self.b.id), subjects=[str(self.subj_b1.id)]), format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)

    def test_superadmin_creates_anywhere(self):
        root = self.as_user(self.root)
        self.assertEqual(root.post(f"{API}/users/", payload(role="admin"), format="json").status_code, 400)  # no branch
        r = root.post(f"{API}/users/", payload(role="admin", branch_id=str(self.b.id)), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="newbie").branch_id, self.b.id)
        r = root.post(f"{API}/users/", payload(username="boss2", role="superadmin", branch_id=str(self.a.id)), format="json")
        self.assertEqual(r.status_code, 201)
        boss = User.objects.get(username="boss2")
        self.assertIsNone(boss.branch_id)
        self.assertTrue(boss.is_superuser)

    def test_password_rules(self):
        admin = self.as_user(self.admin_a)
        self.assertEqual(admin.post(f"{API}/users/", payload(password="short"), format="json").status_code, 400)
        self.assertEqual(admin.post(f"{API}/users/", payload(password="1234567890"), format="json").status_code, 400)
        body = payload()
        del body["password"]
        self.assertEqual(admin.post(f"{API}/users/", body, format="json").status_code, 400)

    def test_duplicate_username_rejected(self):
        r = self.as_user(self.admin_a).post(f"{API}/users/", payload(username="teacher_b"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_update_teacher_subjects_and_password(self):
        admin = self.as_user(self.admin_a)
        url = f"{API}/users/{self.teacher_a.id}/"
        r = admin.patch(url, {"subjects": [str(self.subj_a2.id)], "password": NEW_PASSWORD, "first_name": "Vali"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.teacher_a.refresh_from_db()
        self.assertEqual(list(self.teacher_a.subjects.all()), [self.subj_a2])
        self.assertTrue(self.teacher_a.check_password(NEW_PASSWORD))
        self.assertEqual(self.teacher_a.first_name, "Vali")
        # omitting password/subjects leaves them untouched
        admin.patch(url, {"last_name": "X"}, format="json")
        self.teacher_a.refresh_from_db()
        self.assertTrue(self.teacher_a.check_password(NEW_PASSWORD))
        self.assertEqual(list(self.teacher_a.subjects.all()), [self.subj_a2])

    def test_branch_cannot_be_changed(self):
        for client in (self.as_user(self.admin_a), self.as_user(self.root)):
            client.patch(f"{API}/users/{self.teacher_a.id}/", {"branch_id": str(self.b.id)}, format="json")
        self.teacher_a.refresh_from_db()
        self.assertEqual(self.teacher_a.branch_id, self.a.id)

    def test_role_escalation_blocked(self):
        admin = self.as_user(self.admin_a)
        # promote a teacher to superadmin
        r = admin.patch(f"{API}/users/{self.teacher_a.id}/", {"role": "superadmin"}, format="json")
        self.assertEqual(r.status_code, 403)
        # change own role
        r = admin.patch(f"{API}/users/{self.admin_a.id}/", {"role": "teacher"}, format="json")
        self.assertEqual(r.status_code, 403)
        # staff flags can't be set through the API
        admin.patch(f"{API}/users/{self.teacher_a.id}/", {"is_staff": True, "is_superuser": True}, format="json")
        self.teacher_a.refresh_from_db()
        self.assertFalse(self.teacher_a.is_staff or self.teacher_a.is_superuser)
        self.assertEqual(self.teacher_a.role, Role.TEACHER)
        # even the superadmin can't turn someone into a superadmin through PATCH
        r = self.as_user(self.root).patch(f"{API}/users/{self.teacher_a.id}/", {"role": "superadmin"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_teacher_cannot_manage_users(self):
        t = self.as_user(self.teacher_a)
        self.assertEqual(t.get(f"{API}/users/").status_code, 403)
        self.assertEqual(t.patch(f"{API}/users/{self.teacher_a.id}/", {"role": "admin"}, format="json").status_code, 403)
        self.teacher_a.refresh_from_db()
        self.assertEqual(self.teacher_a.role, Role.TEACHER)

    def test_admin_teacher_to_admin_drops_subjects(self):
        r = self.as_user(self.admin_a).patch(f"{API}/users/{self.teacher_a.id}/", {"role": "admin"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.teacher_a.subjects.count(), 0)

    def test_delete_deactivates_and_blocks_login(self):
        admin = self.as_user(self.admin_a)
        r = admin.delete(f"{API}/users/{self.teacher_a.id}/")
        self.assertEqual(r.status_code, 204)
        self.teacher_a.refresh_from_db()
        self.assertFalse(self.teacher_a.is_active)
        self.assertTrue(User.objects.filter(pk=self.teacher_a.pk).exists())  # not removed
        from django.test import Client
        c = Client()
        c.get("/api/v1/auth/csrf/")
        login = c.post("/api/v1/auth/login/", {"username": "teacher_a", "password": PASSWORD}, content_type="application/json")
        self.assertEqual(login.status_code, 400)
        # can be re-activated
        r = admin.patch(f"{API}/users/{self.teacher_a.id}/", {"is_active": True}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_cannot_deactivate_self(self):
        admin = self.as_user(self.admin_a)
        self.assertEqual(admin.delete(f"{API}/users/{self.admin_a.id}/").status_code, 403)
        r = admin.patch(f"{API}/users/{self.admin_a.id}/", {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 400)
        self.admin_a.refresh_from_db()
        self.assertTrue(self.admin_a.is_active)

    def test_list_filters(self):
        root = self.as_user(self.root)
        self.assertEqual(root.get(f"{API}/users/?role=teacher").json()["count"], 3)
        self.assertEqual(root.get(f"{API}/users/?search=admin_b").json()["count"], 1)
        self.assertEqual(self.as_user(self.admin_a).get(f"{API}/users/?role=teacher").json()["count"], 2)
        self.assertEqual(root.get(f"{API}/users/").json()["count"], 6)


class BranchApiTests(ContentAPITestCase):
    def test_superadmin_crud(self):
        root = self.as_user(self.root)
        r = root.post(f"{API}/branches/", {"name": "Yangi", "slug": "yangi", "address": "Toshkent"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        url = f"{API}/branches/{r.json()['id']}/"
        self.assertEqual(root.patch(url, {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(root.delete(url).status_code, 204)
        self.assertEqual(root.post(f"{API}/branches/", {"name": "X", "slug": "a"}, format="json").status_code, 400)

    def test_branch_with_content_cannot_be_deleted(self):
        r = self.as_user(self.root).delete(f"{API}/branches/{self.a.id}/")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Branch.objects.filter(pk=self.a.pk).exists())

    def test_admin_cannot_write_branches(self):
        admin = self.as_user(self.admin_a)
        self.assertEqual(admin.post(f"{API}/branches/", {"name": "X", "slug": "x"}, format="json").status_code, 403)
        self.assertEqual(admin.patch(f"{API}/branches/{self.a.id}/", {"name": "Hack"}, format="json").status_code, 403)
        self.assertEqual(admin.delete(f"{API}/branches/{self.a.id}/").status_code, 403)
        self.assertEqual(admin.patch(f"{API}/branches/{self.b.id}/", {"name": "Hack"}, format="json").status_code, 403)
        self.a.refresh_from_db()
        self.assertEqual(self.a.name, "Filial A")

    def test_admin_reads_own_branch(self):
        r = self.as_user(self.admin_a).get(f"{API}/branches/{self.a.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["slug"], "a")
