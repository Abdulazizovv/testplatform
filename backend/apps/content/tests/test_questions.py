from apps.content.models import Option, Question, Test

from .helpers import ContentAPITestCase, make_image, make_test
from .test_media import upload


def opts(*pairs):
    return [{"text_src": t, "is_correct": ok} for t, ok in pairs]


class QuestionApiTests(ContentAPITestCase):
    def setUp(self):
        self.client = self.as_user(self.teacher_a)
        self.test = Test.objects.create(subject=self.subj_a1, author=self.teacher_a, title="T")
        self.url = f"/api/v1/tests/{self.test.id}/questions/"

    def create(self, **payload):
        body = {"type": "single", "body_src": "2+2?", "options": opts(("4", True), ("5", False))}
        body.update(payload)
        return self.client.post(self.url, body, format="json")

    def test_create_single_with_options(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["order"], 0)
        self.assertEqual([o["order"] for o in body["options"]], [0, 1])
        self.assertTrue(body["options"][0]["is_correct"])  # staff API exposes it
        self.assertEqual(body["body_html"], "<p>2+2?</p>\n")
        self.assertEqual(self.create().json()["order"], 1)

    def test_text_type_rejected_on_create_and_update(self):
        r = self.create(type="text", options=[])
        self.assertEqual(r.status_code, 400)
        self.assertIn("Yoziladigan savollar keyingi bosqichda", str(r.json()))
        self.assertEqual(Question.objects.count(), 0)
        q = self.create().json()
        r = self.client.patch(f"/api/v1/questions/{q['id']}/", {"type": "text"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Question.objects.get(pk=q["id"]).type, "single")

    def test_unknown_type_rejected(self):
        self.assertEqual(self.create(type="essay").status_code, 400)

    def test_20_plus_options_ok(self):
        many = opts(*[(f"v{i}", i == 7) for i in range(25)])
        r = self.create(options=many)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["options"]), 25)
        publish = self.client.post(f"/api/v1/tests/{self.test.id}/publish/")
        self.assertEqual(publish.status_code, 200, publish.content)

    def test_draft_accepts_incomplete_questions(self):
        for options in ([], opts(("only", True)), opts(("a", True), ("b", True)), opts(("", False), ("b", True))):
            r = self.create(options=options)
            self.assertEqual(r.status_code, 201, (options, r.content))

    def test_publish_rejects_each_invalid_shape(self):
        cases = {
            "kam variant": opts(("only", True)),
            "single 2 to'g'ri": opts(("a", True), ("b", True)),
            "multiple 0 to'g'ri": opts(("a", False), ("b", False)),
            "bo'sh variant": opts(("a", True), ("  ", False)),
        }
        for label, options in cases.items():
            test = Test.objects.create(subject=self.subj_a1, author=self.teacher_a, title=label)
            qtype = "multiple" if "multiple" in label else "single"
            r = self.client.post(
                f"/api/v1/tests/{test.id}/questions/",
                {"type": qtype, "body_src": "Q", "options": options},
                format="json",
            )
            self.assertEqual(r.status_code, 201)
            r = self.client.post(f"/api/v1/tests/{test.id}/publish/")
            self.assertEqual(r.status_code, 400, label)
            self.assertEqual(r.json()["errors"][0]["number"], 1)
            test.refresh_from_db()
            self.assertEqual(test.status, "draft")

    def test_publish_empty_test_rejected(self):
        r = self.client.post(f"/api/v1/tests/{self.test.id}/publish/")
        self.assertEqual(r.status_code, 400)

    def test_publish_question_without_body_rejected(self):
        self.create(body_src="")
        self.assertEqual(self.client.post(f"/api/v1/tests/{self.test.id}/publish/").status_code, 400)

    def test_multiple_with_several_correct_publishes(self):
        self.create(type="multiple", options=opts(("a", True), ("b", True), ("c", False)))
        r = self.client.post(f"/api/v1/tests/{self.test.id}/publish/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "published")

    def test_option_with_only_image_is_valid(self):
        asset = upload(self.client, make_image()).json()
        r = self.create(options=[
            {"text_src": "", "image": asset["id"], "is_correct": True},
            {"text_src": "b", "is_correct": False},
        ])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["options"][0]["image_url"], asset["url"])
        self.assertEqual(self.client.post(f"/api/v1/tests/{self.test.id}/publish/").status_code, 200)

    def test_published_test_enforces_validation_on_question_save(self):
        q = self.create().json()
        self.client.post(f"/api/v1/tests/{self.test.id}/publish/")
        # breaking the question is refused and rolled back
        r = self.client.patch(
            f"/api/v1/questions/{q['id']}/", {"options": opts(("only", True))}, format="json"
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Question.objects.get(pk=q["id"]).options.count(), 2)
        # adding an incomplete question is refused too
        r = self.create(options=opts(("x", False)))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.test.questions.count(), 1)

    def test_update_options_keeps_ids_and_drops_missing(self):
        q = self.create(options=opts(("a", True), ("b", False), ("c", False))).json()
        keep, drop, other = q["options"]
        r = self.client.patch(
            f"/api/v1/questions/{q['id']}/",
            {"options": [
                {"id": other["id"], "text_src": "c2", "is_correct": False},
                {"id": keep["id"], "text_src": "a", "is_correct": True},
                {"text_src": "d", "is_correct": False},
            ]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        got = r.json()["options"]
        self.assertEqual([o["text_src"] for o in got], ["c2", "a", "d"])
        self.assertEqual(got[1]["id"], keep["id"])
        self.assertFalse(Option.objects.filter(pk=drop["id"]).exists())

    def test_option_id_of_another_question_rejected(self):
        q1 = self.create().json()
        q2 = self.create().json()
        r = self.client.patch(
            f"/api/v1/questions/{q1['id']}/",
            {"options": [{"id": q2["options"][0]["id"], "text_src": "steal", "is_correct": True}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Option.objects.get(pk=q2["options"][0]["id"]).text_src, "4")

    def test_html_is_sanitized_on_save(self):
        r = self.create(
            body_format="html",
            body_src='<p>x</p><script>alert(1)</script><img src="https://evil.example/a.png" onerror="y()">',
            options=opts(("<b>ok</b><script>1</script>", True), ("b", False)),
            explanation="<p onclick='z()'>izoh</p>",
        )
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["body_html"], "<p>x</p>")
        self.assertEqual(body["options"][0]["text_html"], "<b>ok</b>")
        self.assertEqual(body["explanation_html"], "<p>izoh</p>")
        self.assertIn("<script>", body["body_src"])  # source kept verbatim, only html is served

    def test_points_must_be_positive(self):
        self.assertEqual(self.create(points=0).status_code, 400)
        self.assertEqual(self.create(points=3).status_code, 201)

    def test_reorder(self):
        ids = [self.create().json()["id"] for _ in range(3)]
        url = f"/api/v1/tests/{self.test.id}/questions/reorder/"
        r = self.client.post(url, {"order": [ids[2], ids[0], ids[1]]}, format="json")
        self.assertEqual(r.status_code, 204)
        got = [q["id"] for q in self.client.get(self.url).json()["results"]]
        self.assertEqual(got, [ids[2], ids[0], ids[1]])
        for bad in ([ids[0], ids[1]], [ids[0], ids[0], ids[1]], [*ids, "00000000-0000-4000-8000-000000000000"]):
            self.assertEqual(self.client.post(url, {"order": bad}, format="json").status_code, 400)

    def test_list_is_paginated(self):
        self.create()
        body = self.client.get(self.url).json()
        self.assertEqual(set(body), {"count", "next", "previous", "results"})

    def test_delete_last_question_of_published_test_refused(self):
        q = self.create().json()
        self.client.post(f"/api/v1/tests/{self.test.id}/publish/")
        self.assertEqual(self.client.delete(f"/api/v1/questions/{q['id']}/").status_code, 400)
        self.client.post(f"/api/v1/tests/{self.test.id}/unpublish/")
        self.assertEqual(self.client.delete(f"/api/v1/questions/{q['id']}/").status_code, 204)


class TestLifecycleTests(ContentAPITestCase):
    def setUp(self):
        self.client = self.as_user(self.teacher_a)

    def test_create_test_sets_branch_and_author_server_side(self):
        r = self.client.post(
            "/api/v1/tests/",
            {"subject": str(self.subj_a1.id), "title": "T1", "branch": str(self.b.id),
             "author": str(self.teacher_a2.id), "status": "published"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        test = Test.objects.get(pk=r.json()["id"])
        self.assertEqual(test.branch_id, self.a.id)
        self.assertEqual(test.author_id, self.teacher_a.id)
        self.assertEqual(test.status, "draft")

    def test_branch_follows_subject(self):
        test = make_test(self.subj_a1)
        self.assertEqual(test.branch_id, self.a.id)

    def test_status_transitions(self):
        test = make_test(self.subj_a1, self.teacher_a)
        base = f"/api/v1/tests/{test.id}"
        self.assertEqual(self.client.post(f"{base}/unpublish/").status_code, 400)  # not published
        self.assertEqual(self.client.post(f"{base}/publish/").json()["status"], "published")
        self.assertEqual(self.client.delete(f"{base}/").status_code, 400)  # published can't be deleted
        self.assertEqual(self.client.post(f"{base}/unpublish/").json()["status"], "draft")
        self.assertEqual(self.client.post(f"{base}/archive/").json()["status"], "archived")
        self.assertEqual(self.client.delete(f"{base}/").status_code, 204)

    def test_settings_validation(self):
        base = {"subject": str(self.subj_a1.id), "title": "T"}
        for bad in ({"pass_percent": 101}, {"time_limit_sec": 0}, {"max_attempts": 0},
                    {"result_visibility": "everything"}):
            r = self.client.post("/api/v1/tests/", {**base, **bad}, format="json")
            self.assertEqual(r.status_code, 400, bad)
        ok = self.client.post(
            "/api/v1/tests/", {**base, "time_limit_sec": None, "max_attempts": None}, format="json"
        )
        self.assertEqual(ok.status_code, 201)
        self.assertIsNone(ok.json()["time_limit_sec"])

    def test_description_rendered_and_sanitized(self):
        r = self.client.post(
            "/api/v1/tests/",
            {"subject": str(self.subj_a1.id), "title": "T", "description_src": "**x** <script>1</script>"},
            format="json",
        )
        self.assertIn("<strong>x</strong>", r.json()["description_html"])
        self.assertNotIn("<script", r.json()["description_html"])

    def test_duplicate_test(self):
        test = make_test(self.subj_a1, self.teacher_a, title="Asl", questions=2, status="published")
        r = self.client.post(f"/api/v1/tests/{test.id}/duplicate/")
        self.assertEqual(r.status_code, 201, r.content)
        copy = Test.objects.get(pk=r.json()["id"])
        self.assertNotEqual(copy.pk, test.pk)
        self.assertEqual(copy.status, "draft")
        self.assertEqual(copy.title, "Asl (nusxa)")
        self.assertEqual(copy.author_id, self.teacher_a.id)
        self.assertEqual(copy.questions.count(), 2)
        self.assertEqual(sum(q.options.count() for q in copy.questions.all()), 4)
        self.assertEqual(test.questions.count(), 2)  # source untouched
        src_ids = set(test.questions.values_list("id", flat=True))
        self.assertFalse(src_ids & set(copy.questions.values_list("id", flat=True)))

    def test_duplicate_into_other_subject_needs_access_and_same_branch(self):
        test = make_test(self.subj_a1, self.teacher_a)
        # teacher_a is not assigned to a2
        r = self.client.post(f"/api/v1/tests/{test.id}/duplicate/", {"subject": str(self.subj_a2.id)}, format="json")
        self.assertEqual(r.status_code, 400)
        # nor to a subject of another branch
        r = self.client.post(f"/api/v1/tests/{test.id}/duplicate/", {"subject": str(self.subj_b1.id)}, format="json")
        self.assertEqual(r.status_code, 400)
        # admin may pick any subject of the branch, but never another branch's
        admin = self.as_user(self.admin_a)
        ok = admin.post(f"/api/v1/tests/{test.id}/duplicate/", {"subject": str(self.subj_a2.id)}, format="json")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.json()["subject"], str(self.subj_a2.id))
        root = self.as_user(self.root)
        bad = root.post(f"/api/v1/tests/{test.id}/duplicate/", {"subject": str(self.subj_b1.id)}, format="json")
        self.assertEqual(bad.status_code, 400)


class TestSearchTests(ContentAPITestCase):
    def test_search_filters_by_title_within_scope(self):
        make_test(self.subj_a1, self.teacher_a, title="Algebra asoslari")
        make_test(self.subj_a1, self.teacher_a, title="Geometriya")
        make_test(self.subj_b1, None, title="Algebra (boshqa filial)")
        client = self.as_user(self.admin_a)
        titles = [t["title"] for t in client.get("/api/v1/tests/?search=algebra").json()["results"]]
        self.assertEqual(titles, ["Algebra asoslari"])
