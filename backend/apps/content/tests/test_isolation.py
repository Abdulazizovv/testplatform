"""
Branch isolation and teacher-subject scoping for every content endpoint.
Admin A must not see / change / delete / clone anything of branch B (and vice versa);
a teacher touches only the subjects assigned to them.
"""

from apps.content.models import MediaAsset, Option, Question, Subject, Test

from .helpers import ContentAPITestCase, make_image, make_test
from .test_media import upload

API = "/api/v1"


class IsolationBase(ContentAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.test_a = make_test(cls.subj_a1, cls.teacher_a, "Test A", questions=2)
        cls.test_a2 = make_test(cls.subj_a2, cls.teacher_a2, "Test A2")
        cls.test_b = make_test(cls.subj_b1, cls.teacher_b, "Test B", questions=2)
        cls.q_b = cls.test_b.questions.first()
        cls.o_b = cls.q_b.options.first()


class CrossBranchTests(IsolationBase):
    def test_subject_list_and_detail(self):
        admin = self.as_user(self.admin_a)
        ids = {s["id"] for s in admin.get(f"{API}/subjects/").json()["results"]}
        self.assertEqual(ids, {str(self.subj_a1.id), str(self.subj_a2.id)})
        self.assertEqual(admin.get(f"{API}/subjects/{self.subj_b1.id}/").status_code, 404)
        root = self.as_user(self.root)
        self.assertEqual(root.get(f"{API}/subjects/").json()["count"], 3)

    def test_subject_update_delete_clone_blocked(self):
        admin = self.as_user(self.admin_a)
        url = f"{API}/subjects/{self.subj_b1.id}/"
        self.assertEqual(admin.patch(url, {"name": "hack"}, format="json").status_code, 404)
        self.assertEqual(admin.delete(url).status_code, 404)
        r = admin.post(f"{url}clone/", {"target_branch": str(self.a.id)}, format="json")
        self.assertEqual(r.status_code, 404)
        self.subj_b1.refresh_from_db()
        self.assertEqual(self.subj_b1.name, "Matematika")
        self.assertEqual(Subject.objects.filter(branch=self.a).count(), 2)

    def test_admin_cannot_create_subject_in_other_branch(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(f"{API}/subjects/", {"name": "Kimyo", "branch_id": str(self.b.id)}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Subject.objects.get(pk=r.json()["id"]).branch_id, self.a.id)

    def test_test_endpoints(self):
        admin = self.as_user(self.admin_a)
        ids = {t["id"] for t in admin.get(f"{API}/tests/").json()["results"]}
        self.assertEqual(ids, {str(self.test_a.id), str(self.test_a2.id)})
        url = f"{API}/tests/{self.test_b.id}"
        self.assertEqual(admin.get(f"{url}/").status_code, 404)
        self.assertEqual(admin.patch(f"{url}/", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(admin.delete(f"{url}/").status_code, 404)
        for action in ("publish", "unpublish", "archive", "duplicate"):
            self.assertEqual(admin.post(f"{url}/{action}/").status_code, 404, action)
        self.assertEqual(admin.get(f"{url}/questions/").status_code, 404)
        self.assertEqual(admin.post(f"{url}/questions/", {"body_src": "x"}, format="json").status_code, 404)
        self.assertEqual(admin.post(f"{url}/questions/reorder/", {"order": []}, format="json").status_code, 404)
        self.test_b.refresh_from_db()
        self.assertEqual((self.test_b.title, self.test_b.status), ("Test B", "draft"))

    def test_cannot_create_test_in_foreign_subject(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(f"{API}/tests/", {"subject": str(self.subj_b1.id), "title": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Test.objects.filter(title="x").exists())

    def test_cannot_move_test_to_foreign_subject_even_as_superadmin(self):
        for user in (self.admin_a, self.root):
            r = self.as_user(user).patch(
                f"{API}/tests/{self.test_a.id}/", {"subject": str(self.subj_b1.id)}, format="json"
            )
            self.assertEqual(r.status_code, 400, user.username)
        self.test_a.refresh_from_db()
        self.assertEqual(self.test_a.subject_id, self.subj_a1.id)

    def test_question_endpoints(self):
        admin = self.as_user(self.admin_a)
        url = f"{API}/questions/{self.q_b.id}/"
        self.assertEqual(admin.get(url).status_code, 404)
        self.assertEqual(admin.patch(url, {"body_src": "x"}, format="json").status_code, 404)
        self.assertEqual(admin.delete(url).status_code, 404)
        self.assertTrue(Question.objects.filter(pk=self.q_b.pk).exists())

    def test_option_cannot_be_reached_or_hijacked(self):
        # Options are only reachable through their question: an option id of branch B
        # smuggled into a branch A question payload is rejected and B's option is untouched.
        admin = self.as_user(self.admin_a)
        q_a = self.test_a.questions.first()
        r = admin.patch(
            f"{API}/questions/{q_a.id}/",
            {"options": [{"id": str(self.o_b.id), "text_src": "pwned", "is_correct": True}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertNotEqual(Option.objects.get(pk=self.o_b.pk).text_src, "pwned")

    def test_media_cannot_be_attached_across_branches(self):
        asset_b = upload(self.as_user(self.admin_b), make_image()).json()
        admin = self.as_user(self.admin_a)
        q_a = self.test_a.questions.first()
        r = admin.patch(f"{API}/questions/{q_a.id}/", {"image": asset_b["id"]}, format="json")
        self.assertEqual(r.status_code, 400)
        r = admin.patch(
            f"{API}/questions/{q_a.id}/",
            {"options": [{"text_src": "a", "image": asset_b["id"], "is_correct": True}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        # embedding B's file URL inside rich text is refused as well
        r = admin.patch(f"{API}/questions/{q_a.id}/", {"body_src": f"![x]({asset_b['url']})"}, format="json")
        self.assertEqual(r.status_code, 400)
        # superadmin can't cross-attach either: media must match the TEST's branch
        r = self.as_user(self.root).patch(f"{API}/questions/{q_a.id}/", {"image": asset_b["id"]}, format="json")
        self.assertEqual(r.status_code, 400)
        q_a.refresh_from_db()
        self.assertIsNone(q_a.image_id)

    def test_own_media_can_be_attached_and_embedded(self):
        asset = upload(self.as_user(self.teacher_a), make_image()).json()
        q_a = self.test_a.questions.first()
        r = self.as_user(self.teacher_a).patch(
            f"{API}/questions/{q_a.id}/",
            {"image": asset["id"], "body_src": f"Rasm: ![x]({asset['url']})"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(asset["url"], r.json()["body_html"])

    def test_media_detail_isolated(self):
        asset = MediaAsset.objects.get(pk=upload(self.as_user(self.admin_b), make_image()).json()["id"])
        self.assertEqual(self.as_user(self.admin_a).get(f"{API}/media/{asset.id}/").status_code, 404)

    def test_users_isolated(self):
        admin = self.as_user(self.admin_a)
        names = {u["username"] for u in admin.get(f"{API}/users/").json()["results"]}
        self.assertEqual(names, {"admin_a", "teacher_a", "teacher_a2"})
        url = f"{API}/users/{self.teacher_b.id}/"
        self.assertEqual(admin.get(url).status_code, 404)
        self.assertEqual(admin.patch(url, {"first_name": "x"}, format="json").status_code, 404)
        self.assertEqual(admin.delete(url).status_code, 404)
        self.teacher_b.refresh_from_db()
        self.assertTrue(self.teacher_b.is_active)
        self.assertEqual(admin.get(f"{API}/users/{self.root.id}/").status_code, 404)

    def test_branch_admin_reads_only_own_branch(self):
        admin = self.as_user(self.admin_a)
        self.assertEqual([b["slug"] for b in admin.get(f"{API}/branches/").json()["results"]], ["a"])
        self.assertEqual(admin.get(f"{API}/branches/{self.b.id}/").status_code, 404)

    def test_all_lists_paginated(self):
        for path in ("subjects", "tests", "media", "users", "branches"):
            body = self.as_user(self.admin_a).get(f"{API}/{path}/").json()
            self.assertEqual(set(body), {"count", "next", "previous", "results"}, path)

    def test_anonymous_gets_nothing(self):
        for path in ("subjects", "tests", "media", "users", "branches", f"questions/{self.q_b.id}"):
            self.assertIn(self.client.get(f"{API}/{path}/").status_code, (401, 403), path)


class TeacherScopeTests(IsolationBase):
    def setUp(self):
        self.t = self.as_user(self.teacher_a)  # assigned to subj_a1 only

    def test_teacher_sees_only_assigned_subjects(self):
        ids = [s["id"] for s in self.t.get(f"{API}/subjects/").json()["results"]]
        self.assertEqual(ids, [str(self.subj_a1.id)])
        self.assertEqual(self.t.get(f"{API}/subjects/{self.subj_a2.id}/").status_code, 404)

    def test_teacher_sees_only_assigned_subject_tests_including_colleagues(self):
        colleague = make_test(self.subj_a1, self.teacher_a2, "Hamkasb testi")
        ids = {x["id"] for x in self.t.get(f"{API}/tests/").json()["results"]}
        self.assertEqual(ids, {str(self.test_a.id), str(colleague.id)})  # decision: whole subject
        self.assertEqual(self.t.get(f"{API}/tests/{self.test_a2.id}/").status_code, 404)

    def test_teacher_cannot_write_to_unassigned_subject(self):
        r = self.t.post(f"{API}/tests/", {"subject": str(self.subj_a2.id), "title": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        url = f"{API}/tests/{self.test_a2.id}"
        self.assertEqual(self.t.patch(f"{url}/", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(self.t.delete(f"{url}/").status_code, 404)
        self.assertEqual(self.t.post(f"{url}/publish/").status_code, 404)
        r = self.t.post(f"{url}/questions/", {"body_src": "x"}, format="json")
        self.assertEqual(r.status_code, 404)
        q = self.test_a2.questions.first()
        self.assertEqual(self.t.patch(f"{API}/questions/{q.id}/", {"body_src": "x"}, format="json").status_code, 404)
        self.assertEqual(self.t.delete(f"{API}/questions/{q.id}/").status_code, 404)
        self.assertEqual(Test.objects.get(pk=self.test_a2.pk).title, "Test A2")

    def test_teacher_cannot_move_test_to_unassigned_subject(self):
        r = self.t.patch(f"{API}/tests/{self.test_a.id}/", {"subject": str(self.subj_a2.id)}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_teacher_edits_colleagues_test_in_shared_subject_but_cannot_delete_it(self):
        self.teacher_a2.subjects.add(self.subj_a1)
        shared = make_test(self.subj_a1, self.teacher_a2, "Umumiy")
        r = self.t.patch(f"{API}/tests/{shared.id}/", {"title": "Yangi"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.t.delete(f"{API}/tests/{shared.id}/").status_code, 403)
        own = make_test(self.subj_a1, self.teacher_a, "Mening")
        self.assertEqual(self.t.delete(f"{API}/tests/{own.id}/").status_code, 204)

    def test_teacher_cannot_write_subjects_or_users_or_branches(self):
        self.assertEqual(self.t.post(f"{API}/subjects/", {"name": "x"}, format="json").status_code, 403)
        self.assertEqual(self.t.patch(f"{API}/subjects/{self.subj_a1.id}/", {"name": "x"}, format="json").status_code, 403)
        self.assertEqual(self.t.delete(f"{API}/subjects/{self.subj_a1.id}/").status_code, 403)
        self.assertEqual(
            self.t.post(f"{API}/subjects/{self.subj_a1.id}/clone/", {"target_branch": str(self.a.id)}, format="json").status_code,
            403,
        )
        self.assertEqual(self.t.get(f"{API}/users/").status_code, 403)
        self.assertEqual(self.t.post(f"{API}/users/", {}, format="json").status_code, 403)
        self.assertEqual(self.t.post(f"{API}/branches/", {"name": "x", "slug": "x"}, format="json").status_code, 403)
        self.assertEqual(self.t.get(f"{API}/branches/").json()["count"], 1)

    def test_teacher_of_other_branch_sees_nothing_of_a(self):
        other = self.as_user(self.teacher_b)
        self.assertEqual(other.get(f"{API}/tests/{self.test_a.id}/").status_code, 404)
        ids = [x["id"] for x in other.get(f"{API}/tests/").json()["results"]]
        self.assertEqual(ids, [str(self.test_b.id)])

    def test_unassigning_subject_removes_access(self):
        self.teacher_a.subjects.remove(self.subj_a1)
        self.assertEqual(self.t.get(f"{API}/tests/{self.test_a.id}/").status_code, 404)


class SubjectCrudTests(ContentAPITestCase):
    def test_admin_crud_in_own_branch(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(f"{API}/subjects/", {"name": "Kimyo asoslari"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["branch"]["slug"], "a")
        self.assertEqual(body["slug"], "kimyo-asoslari")
        r = admin.patch(f"{API}/subjects/{body['id']}/", {"name": "Kimyo", "is_active": False}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["is_active"])
        self.assertEqual(admin.delete(f"{API}/subjects/{body['id']}/").status_code, 204)

    def test_slug_unique_per_branch_only(self):
        admin = self.as_user(self.admin_a)
        r = admin.post(f"{API}/subjects/", {"name": "X", "slug": "math"}, format="json")
        self.assertEqual(r.status_code, 400)  # exists in A
        r = self.as_user(self.admin_b).post(f"{API}/subjects/", {"name": "Y", "slug": "physics"}, format="json")
        self.assertEqual(r.status_code, 201)  # "physics" exists only in A
        r = admin.post(f"{API}/subjects/", {"name": "Matematika"}, format="json")
        self.assertEqual(r.json()["slug"], "matematika")
        r = admin.post(f"{API}/subjects/", {"name": "Matematika"}, format="json")
        self.assertEqual(r.json()["slug"], "matematika-2")

    def test_subject_with_tests_cannot_be_deleted(self):
        make_test(self.subj_a1)
        r = self.as_user(self.admin_a).delete(f"{API}/subjects/{self.subj_a1.id}/")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Subject.objects.filter(pk=self.subj_a1.pk).exists())

    def test_superadmin_must_name_branch(self):
        root = self.as_user(self.root)
        self.assertEqual(root.post(f"{API}/subjects/", {"name": "X"}, format="json").status_code, 400)
        r = root.post(f"{API}/subjects/", {"name": "X", "branch_id": str(self.b.id)}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["branch"]["slug"], "b")

    def test_branch_is_immutable(self):
        r = self.as_user(self.root).patch(
            f"{API}/subjects/{self.subj_a1.id}/", {"branch_id": str(self.b.id)}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.subj_a1.refresh_from_db()
        self.assertEqual(self.subj_a1.branch_id, self.a.id)
