import os
from unittest import mock

from django.conf import settings

from apps.content.models import MediaAsset, Option, Question, Subject, Test
from apps.content.services import subjects as clone_module

from .helpers import ContentAPITestCase, add_question, make_image
from .test_media import upload

API = "/api/v1"


def media_files():
    root = os.path.join(settings.MEDIA_ROOT, "uploads")
    return set(os.listdir(root)) if os.path.isdir(root) else set()


class CloneSubjectTests(ContentAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.subj_a1.description = "Tavsif"
        cls.subj_a1.save()

    def build_source(self):
        """subj_a1 with 2 tests: one published with images (question, option, embedded), one draft."""
        client = self.as_user(self.admin_a)
        img1 = upload(client, make_image(color=(1, 2, 3))).json()
        img2 = upload(client, make_image(color=(9, 9, 9))).json()
        img3 = upload(client, make_image(color=(50, 60, 70))).json()
        t1 = Test.objects.create(
            subject=self.subj_a1, author=self.teacher_a, title="Bir", status="published",
            description_src=f"![x]({img3['url']})", time_limit_sec=600, pass_percent=70,
            shuffle_options=True, result_visibility="full", max_attempts=2,
        )
        q1 = Question.objects.create(
            test=t1, order=0, type="single", body_src=f"Savol ![r]({img2['url']})",
            image_id=img1["id"], explanation="izoh", points=3,
        )
        Option.objects.create(question=q1, order=0, text_src="a", is_correct=True, image_id=img2["id"])
        Option.objects.create(question=q1, order=1, text_src="b", is_correct=False)
        q2 = Question.objects.create(test=t1, order=1, type="multiple", body_src="Ikkinchi")
        for i, ok in enumerate((True, True, False)):
            Option.objects.create(question=q2, order=i, text_src=f"o{i}", is_correct=ok)
        t2 = Test.objects.create(subject=self.subj_a1, title="Ikki", status="draft")
        add_question(t2, "Q")
        return t1, t2, (img1, img2, img3)

    def clone(self, user, target, **extra):
        return self.as_user(user).post(
            f"{API}/subjects/{self.subj_a1.id}/clone/", {"target_branch": str(target.id), **extra}, format="json"
        )

    def test_superadmin_deep_copy_to_other_branch(self):
        t1, t2, (img1, img2, img3) = self.build_source()
        self.teacher_a.subjects.add(self.subj_a1)
        before_files = media_files()
        r = self.clone(self.root, self.b, name="Yangi fan")
        self.assertEqual(r.status_code, 201, r.content)
        new = Subject.objects.get(pk=r.json()["id"])
        self.assertEqual((new.branch_id, new.name, new.slug, new.description), (self.b.id, "Yangi fan", "yangi-fan", "Tavsif"))
        self.assertEqual(r.json()["test_count"], 2)

        tests = {t.title: t for t in new.tests.all()}
        self.assertEqual(set(tests), {"Bir", "Ikki"})
        copy1 = tests["Bir"]
        self.assertEqual(copy1.status, "draft")  # even though the source was published
        self.assertEqual(copy1.branch_id, self.b.id)
        self.assertEqual(copy1.author_id, self.root.id)
        self.assertEqual(
            (copy1.time_limit_sec, copy1.pass_percent, copy1.shuffle_options, copy1.result_visibility, copy1.max_attempts),
            (600, 70, True, "full", 2),
        )
        self.assertNotEqual(copy1.pk, t1.pk)
        qs = list(copy1.questions.order_by("order"))
        self.assertEqual([q.type for q in qs], ["single", "multiple"])
        self.assertEqual([q.points for q in qs], [3, 1])
        self.assertEqual([[o.is_correct for o in q.options.order_by("order")] for q in qs], [[True, False], [True, True, False]])
        self.assertFalse({q.pk for q in qs} & set(t1.questions.values_list("pk", flat=True)))
        self.assertFalse(
            set(Option.objects.filter(question__test=copy1).values_list("pk", flat=True))
            & set(Option.objects.filter(question__test=t1).values_list("pk", flat=True))
        )

        # media: NEW assets in branch B with their own files; nothing in B points at A's files
        b_assets = MediaAsset.objects.filter(branch=self.b)
        self.assertEqual(b_assets.count(), 3)
        self.assertFalse({a.file.name for a in b_assets} & {img1["url"][7:], img2["url"][7:], img3["url"][7:]})
        for a in b_assets:
            self.assertTrue(os.path.exists(os.path.join(settings.MEDIA_ROOT, a.file.name)))
        self.assertEqual(len(media_files() - before_files), 3)
        q_first = qs[0]
        self.assertEqual(q_first.image.branch_id, self.b.id)
        self.assertEqual(q_first.options.get(order=0).image.branch_id, self.b.id)
        for old in (img1, img2, img3):
            for text in (q_first.body_src, q_first.body_html, copy1.description_src, copy1.description_html):
                self.assertNotIn(old["url"], text)
        self.assertIn("/media/uploads/", q_first.body_html)
        # source untouched
        self.assertEqual(self.subj_a1.tests.count(), 2)
        self.assertEqual(MediaAsset.objects.filter(branch=self.a).count(), 3)
        t1.refresh_from_db()
        self.assertIn(img2["url"], t1.questions.get(order=0).body_src)
        # teacher assignments are not copied
        self.assertEqual(new.teachers.count(), 0)

    def test_clone_links_to_existing_identical_media_in_target(self):
        t1, _, (img1, img2, img3) = self.build_source()
        # branch B already has the very same image as img1
        existing = upload(self.as_user(self.admin_b), make_image(color=(1, 2, 3)))
        self.assertEqual(existing.status_code, 201)
        r = self.clone(self.root, self.b)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(MediaAsset.objects.filter(branch=self.b).count(), 3)  # 1 pre-existing + 2 new
        copy = Test.objects.get(subject_id=r.json()["id"], title="Bir")
        self.assertEqual(str(copy.questions.get(order=0).image_id), existing.json()["id"])

    def test_default_name_and_slug_when_target_has_same_slug(self):
        r = self.clone(self.root, self.b)  # B already has slug "math"
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["name"], "Matematika")
        self.assertEqual(r.json()["slug"], "math-2")

    def test_admin_can_copy_within_own_branch(self):
        self.build_source()
        r = self.clone(self.admin_a, self.a)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["name"], "Matematika (nusxa)")
        self.assertEqual(r.json()["branch"]["slug"], "a")
        new = Subject.objects.get(pk=r.json()["id"])
        self.assertEqual(new.tests.count(), 2)
        # same branch: media is shared, not duplicated
        self.assertEqual(MediaAsset.objects.filter(branch=self.a).count(), 3)

    def test_admin_cannot_copy_to_other_branch(self):
        r = self.clone(self.admin_a, self.b)
        self.assertEqual(r.status_code, 403)
        self.assertIn("superadmin", r.json()["detail"])
        self.assertEqual(Subject.objects.filter(branch=self.b).count(), 1)
        # nonexistent branch id doesn't reveal anything different for an admin
        r = self.as_user(self.admin_a).post(
            f"{API}/subjects/{self.subj_a1.id}/clone/",
            {"target_branch": "00000000-0000-4000-8000-000000000000"}, format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_unknown_target_for_superadmin(self):
        r = self.as_user(self.root).post(
            f"{API}/subjects/{self.subj_a1.id}/clone/",
            {"target_branch": "00000000-0000-4000-8000-000000000000"}, format="json",
        )
        self.assertEqual(r.status_code, 400)
        r = self.as_user(self.root).post(f"{API}/subjects/{self.subj_a1.id}/clone/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_rollback_leaves_nothing_behind(self):
        self.build_source()
        subjects_before = Subject.objects.count()
        tests_before = Test.objects.count()
        questions_before = Question.objects.count()
        assets_before = MediaAsset.objects.count()
        files_before = media_files()

        # fail after the media has been copied and the first test/questions were inserted
        with mock.patch.object(clone_module.Option.objects, "bulk_create", side_effect=RuntimeError("boom")):
            client = self.as_user(self.root)
            client.raise_request_exception = False
            r = client.post(
                f"{API}/subjects/{self.subj_a1.id}/clone/", {"target_branch": str(self.b.id)}, format="json"
            )
        self.assertEqual(r.status_code, 500)
        self.assertEqual(Subject.objects.count(), subjects_before)
        self.assertEqual(Test.objects.count(), tests_before)
        self.assertEqual(Question.objects.count(), questions_before)
        self.assertEqual(MediaAsset.objects.count(), assets_before)
        self.assertEqual(media_files(), files_before)  # copied files were removed again
        # ...and the very same call works afterwards
        self.assertEqual(self.clone(self.root, self.b).status_code, 201)

    def test_clone_of_subject_without_tests(self):
        r = self.as_user(self.root).post(
            f"{API}/subjects/{self.subj_a2.id}/clone/", {"target_branch": str(self.b.id)}, format="json"
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["test_count"], 0)
