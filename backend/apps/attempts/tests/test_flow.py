"""Anonymous attempt flow: start, autosave, finish, results, security."""

from apps.attempts.models import Attempt, AttemptItem
from apps.attempts.scoping import attempts_for
from apps.attempts.services.snapshot import build_snapshots
from apps.content.models import Test
from apps.core.roles import Role

from .helpers import API, SECRET_EXPLANATION, PublicAPITestCase, make_published, rate


class StartTests(PublicAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.test = make_published(cls.subj_a1, time_limit_sec=600, pass_percent=50)

    def test_start_returns_questions_without_answers(self):
        r = self.start(self.test)
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assert_no_leak(r)
        self.assertEqual(len(body["access_token"]), 43)
        self.assertEqual([i["order"] for i in body["items"]], [1, 2])
        self.assertEqual(body["items"][1]["type"], "multiple")
        self.assertIn(body["remaining_sec"], range(595, 601))
        self.assertIsNotNone(body["deadline_at"])
        self.assertEqual(Attempt.objects.get().branch_id, self.a.id)
        self.assertEqual(Attempt.objects.get().pass_percent, 50)
        self.assertEqual(r.headers["Cache-Control"], "no-store")

    def test_device_cookie_is_httponly_lax(self):
        cookie = self.start(self.test).cookies["tp_device"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertGreater(len(cookie.value), 20)

    def test_unlimited_time_has_no_deadline(self):
        test = make_published(self.subj_a1, "Cheksiz")
        body = self.start(test).json()
        self.assertIsNone(body["deadline_at"])
        self.assertIsNone(body["remaining_sec"])

    def test_name_and_age_validation(self):
        bad_names = ["", " ", "A", "12345", "Ali<script>", "Ali_Vali", "'Ali", "A" * 61, "Ali 5", "-Ali"]
        for name in bad_names:
            r = self.start(self.test, name=name)
            self.assertEqual(r.status_code, 400, name)
            self.assertIn("full_name", r.json(), name)
        for age in (3, 101, "abc", None, 0, -5):
            r = self.start(self.test, age=age)
            self.assertEqual(r.status_code, 400, age)
            self.assertIn("age", r.json(), age)
        self.assertEqual(Attempt.objects.count(), 0)

    def test_valid_names_accepted_and_normalised(self):
        for name, expected in [
            ("  Ali   Valiyev ", "Ali Valiyev"),
            ("O'tkir Hamidov", "O'tkir Hamidov"),
            ("Oʻtkir G‘ulom", "Oʻtkir G‘ulom"),
            ("Anna-Maria", "Anna-Maria"),
            ("Ёлка Иванова", "Ёлка Иванова"),
        ]:
            r = self.start(self.test, client=self._fresh(), name=name, age=4)
            self.assertEqual(r.status_code, 201, name)
            self.assertEqual(r.json()["full_name"], expected)

    def _fresh(self):
        from rest_framework.test import APIClient

        return APIClient()

    def test_age_boundaries(self):
        self.assertEqual(self.start(self.test, client=self._fresh(), age=4).status_code, 201)
        self.assertEqual(self.start(self.test, client=self._fresh(), age=100).status_code, 201)

    def test_one_active_attempt_per_device(self):
        first = self.start(self.test)
        again = self.start(self.test, name="ali valiyev")  # same name: resumed
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.json()["resumed"])
        self.assertEqual(again.json()["access_token"], first.json()["access_token"])
        other = self.start(self.test, name="Vali Aliyev")
        self.assertEqual(other.status_code, 409)
        self.assertEqual(Attempt.objects.count(), 1)

    def test_new_device_gets_its_own_attempt(self):
        self.start(self.test)
        self.assertEqual(self.start(self.test, client=self._fresh(), name="Vali Aliyev").status_code, 201)
        self.assertEqual(Attempt.objects.count(), 2)

    def test_max_attempts_counts_per_device(self):
        test = make_published(self.subj_a1, "Bitta urinish", max_attempts=1)
        first = self.start(test).json()
        self.anon.post(f"{API}/attempts/{first['access_token']}/finish/")
        blocked = self.start(test)
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("1", blocked.json()["detail"])
        # documented soft limit: another device (no cookie) is a new student
        self.assertEqual(self.start(test, client=self._fresh(), name="Vali Aliyev").status_code, 201)

    def test_creation_is_throttled_per_ip(self):
        with rate("attempt_create", "2/hour"):
            responses = [self.start(self.test) for _ in range(4)]
        self.assertEqual([r.status_code for r in responses], [201, 200, 429, 429])
        self.assertNotIn("throttled", responses[2].json()["detail"].lower())

    def test_unknown_test_is_404(self):
        r = self.anon.post(f"{API}/tests/6f1d3d8e-1b1e-4c39-9d0f-0f3a3c0f1111/attempts/", {"full_name": "Ali", "age": 9}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_shuffle_is_deterministic_and_frozen(self):
        test = Test.objects.create(
            subject=self.subj_a1, title="Aralash", status="published", shuffle_questions=True, shuffle_options=True
        )
        from apps.content.tests.helpers import add_question

        for i in range(15):
            add_question(test, f"S{i}", "single", (("a", True), ("b", False), ("c", False), ("d", False)))
        # same seed -> same order; different seed -> different order
        first = [s["body_html"] for _, s in build_snapshots(test, 7)]
        self.assertEqual(first, [s["body_html"] for _, s in build_snapshots(test, 7)])
        self.assertNotEqual(first, [s["body_html"] for _, s in build_snapshots(test, 8)])
        self.assertNotEqual(first, [f"<p>S{i}</p>\n" for i in range(15)])
        # refresh keeps the stored order
        started = self.start(test).json()
        token = started["access_token"]
        again = self.anon.get(f"{API}/attempts/{token}/").json()
        self.assertEqual([i["id"] for i in started["items"]], [i["id"] for i in again["items"]])
        self.assertEqual(
            [[o["id"] for o in i["options"]] for i in started["items"]],
            [[o["id"] for o in i["options"]] for i in again["items"]],
        )


class AnswerTests(PublicAPITestCase):
    def setUp(self):
        super().setUp()
        self.test = make_published(self.subj_a1, time_limit_sec=600)
        self.q1, self.q2 = self.test.questions.order_by("order")
        started = self.start(self.test).json()
        self.token = started["access_token"]
        self.items = started["items"]

    def test_save_is_idempotent_and_returns_no_correctness(self):
        opt = self.items[0]["options"][1]["id"]
        for _ in range(3):
            r = self.answer(self.token, self.items[0], [opt])
            self.assertEqual(r.status_code, 200)
            self.assert_no_leak(r)
            self.assertEqual(r.json()["selected_option_ids"], [opt])
            self.assertEqual(r.json()["answered_count"], 1)
        detail = self.anon.get(f"{API}/attempts/{self.token}/")
        self.assert_no_leak(detail)
        self.assertEqual(detail.json()["items"][0]["selected_option_ids"], [opt])
        self.assertEqual(detail.json()["answered_count"], 1)
        self.assertEqual(AttemptItem.objects.filter(attempt__access_token=self.token, answered_at__isnull=False).count(), 1)

    def test_change_and_clear_answer(self):
        a, b = self.items[0]["options"][0]["id"], self.items[0]["options"][1]["id"]
        self.answer(self.token, self.items[0], [a])
        self.assertEqual(self.answer(self.token, self.items[0], [b]).json()["selected_option_ids"], [b])
        r = self.answer(self.token, self.items[0], [])
        self.assertEqual(r.json()["answered_count"], 0)

    def test_answer_by_question_order(self):
        opt = self.items[1]["options"][0]["id"]
        r = self.anon.put(
            f"{API}/attempts/{self.token}/answers/", {"question_order": 2, "selected_option_ids": [opt]}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["order"], 2)

    def test_needs_exactly_one_selector(self):
        url = f"{API}/attempts/{self.token}/answers/"
        self.assertEqual(self.anon.post(url, {"selected_option_ids": []}, format="json").status_code, 400)
        both = {"item_id": self.items[0]["id"], "question_order": 1, "selected_option_ids": []}
        self.assertEqual(self.anon.post(url, both, format="json").status_code, 400)

    def test_foreign_option_ids_rejected(self):
        # an option of the same test but another question, of another test, and a random uuid
        other_test = make_published(self.subj_a1, "Boshqa")
        foreign = str(other_test.questions.first().options.first().id)
        same_test_other_q = self.items[1]["options"][0]["id"]
        for bad in (foreign, same_test_other_q, "6f1d3d8e-1b1e-4c39-9d0f-0f3a3c0f1111"):
            r = self.answer(self.token, self.items[0], [bad])
            self.assertEqual(r.status_code, 400, bad)
            self.assert_no_leak(r)
        r = self.answer(self.token, self.items[0], ["not-a-uuid"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(AttemptItem.objects.filter(answered_at__isnull=False).count(), 0)

    def test_other_attempts_item_rejected(self):
        from rest_framework.test import APIClient

        other = self.start(self.test, client=APIClient(), name="Vali Aliyev").json()
        r = self.answer(self.token, other["items"][0], [other["items"][0]["options"][0]["id"]])
        self.assertEqual(r.status_code, 404)

    def test_single_rejects_two_options(self):
        two = [o["id"] for o in self.items[0]["options"][:2]]
        self.assertEqual(self.answer(self.token, self.items[0], two).status_code, 400)
        two_multi = [o["id"] for o in self.items[1]["options"][:2]]
        self.assertEqual(self.answer(self.token, self.items[1], two_multi).status_code, 200)

    def test_deadline_passed_rejects_answer_and_expires(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        self.age_attempt(self.token, 60)
        r = self.answer(self.token, self.items[1], self.correct_ids(self.q2))
        self.assertEqual(r.status_code, 410)
        self.assert_no_leak(r)
        attempt = Attempt.objects.get(access_token=self.token)
        self.assertEqual(attempt.status, "expired")  # committed even though the request failed
        self.assertEqual((attempt.score, attempt.max_score), (1, 2))  # what was saved is graded
        # the late answer was not stored
        self.assertIsNone(AttemptItem.objects.get(attempt=attempt, order=2).answered_at)

    def test_answer_within_grace_is_accepted(self):
        self.age_attempt(self.token, 1)
        self.assertEqual(self.answer(self.token, self.items[0], self.correct_ids(self.q1)).status_code, 200)

    def test_lazy_expiry_on_get_and_result(self):
        self.age_attempt(self.token, 60)
        detail = self.anon.get(f"{API}/attempts/{self.token}/").json()
        self.assertEqual(detail["status"], "expired")
        self.assertNotIn("items", detail)
        self.assertEqual(self.anon.get(f"{API}/attempts/{self.token}/result/").status_code, 200)

    def test_answers_are_throttled(self):
        opt = self.items[0]["options"][0]["id"]
        with rate("attempt_token", "3/min"):
            codes = [self.answer(self.token, self.items[0], [opt]).status_code for _ in range(5)]
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3:], [429, 429])


class FinishAndResultTests(PublicAPITestCase):
    def setUp(self):
        super().setUp()
        self.test = make_published(self.subj_a1, pass_percent=50, result_visibility="full")
        self.q1, self.q2 = self.test.questions.order_by("order")
        started = self.start(self.test).json()
        self.token = started["access_token"]
        self.items = started["items"]

    def finish(self):
        return self.anon.post(f"{API}/attempts/{self.token}/finish/")

    def test_in_progress_result_is_refused(self):
        r = self.anon.get(f"{API}/attempts/{self.token}/result/")
        self.assertEqual(r.status_code, 409)
        self.assert_no_leak(r)
        self.assertNotIn("score", r.json())

    def test_all_correct(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        self.answer(self.token, self.items[1], self.correct_ids(self.q2))
        r = self.finish()
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["score"], body["max_score"], body["percent"], body["passed"]), (2, 2, 100.0, True))
        self.assertEqual(body["status"], "finished")
        self.assertTrue(all(i["is_correct"] for i in body["items"]))

    def test_multiple_needs_exact_match(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        partial = self.correct_ids(self.q2)[:1]
        self.answer(self.token, self.items[1], partial)
        body = self.finish().json()
        self.assertEqual(body["score"], 1)  # no partial credit
        self.assertEqual(body["percent"], 50.0)
        self.assertTrue(body["passed"])  # 50 >= 50
        self.assertFalse(body["items"][1]["is_correct"])

    def test_multiple_with_extra_wrong_option_is_zero(self):
        wrong = self.correct_ids(self.q2) + [str(self.q2.options.get(is_correct=False).id)]
        self.answer(self.token, self.items[1], wrong)
        self.assertEqual(self.finish().json()["score"], 0)

    def test_unanswered_and_fail(self):
        body = self.finish().json()
        self.assertEqual((body["score"], body["percent"], body["passed"]), (0, 0.0, False))
        self.assertTrue(all(not i["answered"] for i in body["items"]))

    def test_points_weight_the_score(self):
        self.q1.points = 3
        self.q1.save()
        started = self.start(self.test, client=self._client(), name="Vali Aliyev").json()
        token, items = started["access_token"], started["items"]
        self.answer(token, items[0], self.correct_ids(self.q1))
        body = self.anon.post(f"{API}/attempts/{token}/finish/").json()
        self.assertEqual((body["score"], body["max_score"], body["percent"]), (3, 4, 75.0))

    @staticmethod
    def _client():
        from rest_framework.test import APIClient

        return APIClient()

    def test_finish_is_idempotent_and_locks_answers(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        first = self.finish().json()
        second = self.finish().json()
        self.assertEqual(first, second)
        r = self.answer(self.token, self.items[1], self.correct_ids(self.q2))
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.finish().json()["score"], 1)
        detail = self.anon.get(f"{API}/attempts/{self.token}/").json()
        self.assertNotIn("items", detail)  # closed attempts no longer expose the questions

    def test_full_result_contains_review(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        self.finish()
        body = self.anon.get(f"{API}/attempts/{self.token}/result/").json()
        item = body["items"][0]
        self.assertEqual(item["explanation_html"].strip(), f"<p>{SECRET_EXPLANATION}</p>")
        self.assertEqual([o["is_correct"] for o in item["options"]], [True, False, False])
        self.assertEqual([o["selected"] for o in item["options"]], [True, False, False])

    def test_visibility_score(self):
        Test.objects.filter(pk=self.test.pk).update(result_visibility="score")
        body = self.finish().json()
        self.assertIn("percent", body)
        self.assertNotIn("items", body)
        result = self.anon.get(f"{API}/attempts/{self.token}/result/")
        self.assert_no_leak(result)
        self.assertNotIn("items", result.json())

    def test_visibility_none(self):
        Test.objects.filter(pk=self.test.pk).update(result_visibility="none")
        body = self.finish().json()
        self.assertEqual(body["status"], "finished")
        for key in ("score", "max_score", "percent", "passed", "items"):
            self.assertNotIn(key, body)
        result = self.anon.get(f"{API}/attempts/{self.token}/result/")
        self.assertEqual(set(result.json()), {"status", "test", "full_name", "started_at", "finished_at", "result_visibility"})

    def test_result_survives_edits_and_deletes(self):
        self.answer(self.token, self.items[0], self.correct_ids(self.q1))
        self.answer(self.token, self.items[1], self.correct_ids(self.q2))
        before = self.finish().json()
        staff = self.as_user(self.admin_a)
        # 1) edit question text + replace all options (old option rows are deleted)
        r = staff.patch(
            f"/api/v1/questions/{self.q1.id}/",
            {"body_src": "YANGI MATN", "explanation": "yangi izoh",
             "options": [{"text_src": "Q", "is_correct": False}, {"text_src": "W", "is_correct": True}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        # 2) change points / result visibility-independent fields
        after = self.anon.get(f"{API}/attempts/{self.token}/result/").json()
        self.assertEqual(before["items"], after["items"])
        self.assertEqual(after["score"], 2)
        self.assertNotIn("YANGI", str(after))
        # 3) staff can neither delete the question nor the test any more
        self.assertEqual(staff.delete(f"/api/v1/questions/{self.q1.id}/").status_code, 409)
        self.test.status = "draft"
        self.test.save()
        self.assertEqual(staff.delete(f"/api/v1/tests/{self.test.id}/").status_code, 409)
        self.assertTrue(Test.objects.filter(pk=self.test.pk).exists())

    def test_in_progress_survives_option_edit(self):
        # options replaced mid-attempt: the running attempt keeps its frozen options
        self.as_user(self.admin_a).patch(
            f"/api/v1/questions/{self.q1.id}/",
            {"options": [{"text_src": "Q", "is_correct": True}, {"text_src": "W", "is_correct": False}]},
            format="json",
        )
        old = self.items[0]["options"][0]["id"]
        self.assertEqual(self.answer(self.token, self.items[0], [old]).status_code, 200)


class TokenTests(PublicAPITestCase):
    def setUp(self):
        super().setUp()
        self.test = make_published(self.subj_a1)
        self.token = self.start(self.test).json()["access_token"]

    def test_bad_tokens_are_404_everywhere(self):
        for bad in ("x" * 43, "short", "A" * 300, "../../etc", "a b", self.token[:-1] + ("A" if self.token[-1] != "A" else "B")):
            for method, suffix in (("get", ""), ("post", "answers/"), ("post", "finish/"), ("get", "result/")):
                body = {"item_id": "6f1d3d8e-1b1e-4c39-9d0f-0f3a3c0f1111", "selected_option_ids": []} if suffix == "answers/" else {}
                r = getattr(self.anon, method)(f"{API}/attempts/{bad}/{suffix}", body, format="json")
                self.assertEqual(r.status_code, 404, (bad, suffix))
                self.assert_no_leak(r)

    def test_tokens_are_unique_and_long(self):
        from rest_framework.test import APIClient

        tokens = {self.token}
        for i in range(5):
            tokens.add(self.start(self.test, client=APIClient(), name=f"Ali {'ab' * i}x").json()["access_token"])
        self.assertEqual(len(tokens), 6)
        self.assertTrue(all(len(t) >= 43 for t in tokens))

    def test_no_public_listing_of_attempts(self):
        for url in (f"{API}/attempts/", f"{API}/tests/{self.test.id}/attempts/"):
            self.assertEqual(self.anon.get(url).status_code, 405 if "tests" in url else 404)

    def test_staff_session_is_not_used_by_public_api(self):
        # A logged-in staff member is treated like anyone else (no CSRF surface, no privileges).
        client = self.as_user(self.admin_a)
        self.assertEqual(client.get(f"{API}/attempts/{self.token}/").status_code, 200)


class ScopingTests(PublicAPITestCase):
    def test_attempts_for_is_branch_scoped(self):
        from rest_framework.test import APIClient

        ta, tb = make_published(self.subj_a1), make_published(self.subj_b1)
        self.start(ta)
        self.start(tb, client=APIClient())
        self.assertEqual(Attempt.objects.count(), 2)
        self.assertEqual([a.test_id for a in attempts_for(self.admin_a)], [ta.id])
        self.assertEqual([a.test_id for a in attempts_for(self.teacher_b)], [tb.id])
        self.assertEqual(attempts_for(self.root).count(), 2)
        from django.contrib.auth.models import AnonymousUser

        self.assertEqual(attempts_for(AnonymousUser()).count(), 0)
        self.a.is_active = False
        self.a.save()
        self.admin_a.refresh_from_db()
        self.assertEqual(attempts_for(self.admin_a).count(), 0)
        self.assertEqual(Role.ADMIN, self.admin_a.role)
