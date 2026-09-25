from datetime import timedelta
from unittest import mock

from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.attempts.models import Attempt
from apps.content.models import Test
from apps.content.tests.helpers import ContentAPITestCase, add_question

API = "/api/v1/public"
SECRET_EXPLANATION = "IZOH-SIRI-XYZ"


def make_published(subject, title="Namuna test", **fields):
    """Published test: Q1 single (A correct), Q2 multiple (X, Y correct), both with an explanation."""
    test = Test.objects.create(subject=subject, title=title, status="published", **fields)
    q1 = add_question(test, "Q1", "single", (("A", True), ("B", False), ("C", False)))
    q2 = add_question(test, "Q2", "multiple", (("X", True), ("Y", True), ("Z", False)))
    for q in (q1, q2):
        q.explanation = SECRET_EXPLANATION
        q.save()
    return test


def rate(scope, value):
    return mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {scope: value})


class PublicAPITestCase(ContentAPITestCase):
    def setUp(self):
        self.anon = APIClient()

    def start(self, test, client=None, name="Ali Valiyev", age=12):
        client = client or self.anon
        return client.post(f"{API}/tests/{test.id}/attempts/", {"full_name": name, "age": age}, format="json")

    def answer(self, token, item, option_ids, client=None):
        client = client or self.anon
        return client.post(
            f"{API}/attempts/{token}/answers/",
            {"item_id": item["id"], "selected_option_ids": option_ids},
            format="json",
        )

    @staticmethod
    def correct_ids(question):
        return [str(o.id) for o in question.options.filter(is_correct=True)]

    def age_attempt(self, token, seconds):
        """Move the deadline `seconds` into the past (server clock is the only authority)."""
        Attempt.objects.filter(access_token=token).update(deadline_at=timezone.now() - timedelta(seconds=seconds))

    def assert_no_leak(self, response):
        body = response.content.decode()
        self.assertNotIn("is_correct", body)
        self.assertNotIn(SECRET_EXPLANATION, body)
        self.assertNotIn("explanation", body)
