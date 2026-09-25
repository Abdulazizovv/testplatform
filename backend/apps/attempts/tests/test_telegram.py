"""Telegram result notifications: message format, config gating, idempotency, failure isolation."""

import io
import json
import urllib.error
from unittest import mock

from celery.exceptions import Retry
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.attempts.models import Attempt
from apps.attempts.services import telegram
from apps.attempts.tasks import notify_attempt_finished

from .helpers import PublicAPITestCase, make_published

CONF = dict(TELEGRAM_BOT_TOKEN="123:SECRET-TOKEN", TELEGRAM_CHAT_ID="-100shared", PUBLIC_BASE_URL="https://example.test")
SEND = "apps.attempts.services.telegram.send_message"


class TelegramBase(PublicAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.test = make_published(cls.subj_a1, "Namuna test", pass_percent=60)

    def finished_attempt(self, name="Ali Valiyev", right=True):
        body = self.start(self.test, name=name).json()
        token = body["access_token"]
        if right:
            for item in body["items"]:
                q = self.test.questions.get(order=item["order"] - 1)
                self.answer(token, item, self.correct_ids(q))
        self.anon.post(f"/api/v1/public/attempts/{token}/finish/")
        return Attempt.objects.select_related("test__subject", "branch").get(access_token=token)


@override_settings(**CONF)
class MessageTests(TelegramBase):
    def test_passed_message(self):
        text = telegram.build_message(self.finished_attempt())
        self.assertIn("✅ <b>Yangi test natijasi</b>", text)
        self.assertIn("<b>Ali Valiyev</b>, 12 yosh", text)
        self.assertIn("Fan: Matematika", text)
        self.assertIn("Filial: Filial A", text)
        self.assertIn("<b>2/2 (100%)</b>", text)
        self.assertIn("O'tdi ✅ (o'tish: 60%)", text)
        self.assertIn("Davomiyligi", text)
        self.assertIn('<a href="https://example.test/panel/natijalar/', text)
        self.assertNotIn("access_token", text)

    def test_failed_message(self):
        a = self.finished_attempt(right=False)
        text = telegram.build_message(a)
        self.assertTrue(text.startswith("❌"))
        self.assertIn("O'tmadi ❌", text)
        self.assertNotIn(a.access_token, text)  # the student's secret link never goes to the chat

    def test_expired_message(self):
        a = self.finished_attempt()
        Attempt.objects.filter(pk=a.pk).update(status="expired")
        a.refresh_from_db()
        self.assertIn("Vaqt tugagani uchun", telegram.build_message(a))

    def test_html_is_escaped(self):
        a = self.finished_attempt()
        a.full_name = "<script>alert(1)</script> & Co"
        a.test.title = '<b onclick="x">Hack</b>'
        a.test.subject.name = "<i>Fan</i>"
        a.branch.name = "F&F <u>"
        text = telegram.build_message(a)
        for raw in ("<script>", "<i>", "<u>", 'onclick="x">'):
            self.assertNotIn(raw, text)
        self.assertIn("&lt;script&gt;", text)
        self.assertIn("F&amp;F", text)

    def test_length_capped(self):
        a = self.finished_attempt()
        a.test.title = "T" * 5000
        a.test.subject.name = "S" * 5000
        a.branch.name = "B" * 5000
        a.full_name = "N" * 5000
        self.assertLessEqual(len(telegram.build_message(a)), 4096)

    def test_no_link_without_public_base_url(self):
        with override_settings(PUBLIC_BASE_URL=""):
            self.assertNotIn("<a ", telegram.build_message(self.finished_attempt()))
        with override_settings(PUBLIC_BASE_URL="javascript:alert(1)"):
            self.assertNotIn("<a ", telegram.build_message(self.finished_attempt()))


@override_settings(**CONF)
class TaskTests(TelegramBase):
    def test_sends_once_and_is_idempotent(self):
        a = self.finished_attempt()
        with mock.patch(SEND) as send:
            notify_attempt_finished.apply(args=(str(a.id),))
            notify_attempt_finished.apply(args=(str(a.id),))
        self.assertEqual(send.call_count, 1)
        a.refresh_from_db()
        self.assertIsNotNone(a.telegram_notified_at)

    def test_branch_chat_beats_shared_chat(self):
        self.a.telegram_chat_id = "-100branch"
        self.a.save()
        a = self.finished_attempt()
        with mock.patch(SEND) as send:
            notify_attempt_finished.apply(args=(str(a.id),))
        self.assertEqual(send.call_args.args[0], "-100branch")

    def test_falls_back_to_shared_chat(self):
        a = self.finished_attempt()
        with mock.patch(SEND) as send:
            notify_attempt_finished.apply(args=(str(a.id),))
        self.assertEqual(send.call_args.args[0], "-100shared")

    def test_unconfigured_is_silent(self):
        a = self.finished_attempt()
        for conf in ({"TELEGRAM_BOT_TOKEN": ""}, {"TELEGRAM_CHAT_ID": ""}):
            with override_settings(**conf), mock.patch(SEND) as send:
                result = notify_attempt_finished.apply(args=(str(a.id),))
            self.assertFalse(send.called)
            self.assertTrue(result.successful())
        a.refresh_from_db()
        self.assertIsNone(a.telegram_notified_at)

    def test_unfinished_attempt_not_sent(self):
        body = self.start(self.test, name="Yechyapti").json()
        a = Attempt.objects.get(access_token=body["access_token"])
        with mock.patch(SEND) as send:
            notify_attempt_finished.apply(args=(str(a.id),))
        self.assertFalse(send.called)

    def test_retryable_failure_releases_claim_and_retries(self):
        a = self.finished_attempt()
        err = telegram.TelegramError("Too Many Requests", retryable=True, retry_after=7)
        with mock.patch(SEND, side_effect=err), mock.patch.object(
            notify_attempt_finished, "retry", side_effect=Retry()
        ) as retry, self.assertRaises(Retry):
            notify_attempt_finished.apply(args=(str(a.id),))
        self.assertEqual(retry.call_args.kwargs["countdown"], 8)  # Telegram's retry_after + 1
        a.refresh_from_db()
        self.assertIsNone(a.telegram_notified_at)  # a later attempt may still send

    def test_permanent_failure_does_not_retry(self):
        a = self.finished_attempt()
        err = telegram.TelegramError("chat not found", retryable=False)
        with mock.patch(SEND, side_effect=err), mock.patch.object(notify_attempt_finished, "retry") as retry:
            result = notify_attempt_finished.apply(args=(str(a.id),))
        self.assertFalse(retry.called)
        self.assertTrue(result.successful())

    def test_unexpected_crash_is_contained(self):
        a = self.finished_attempt()
        with mock.patch(SEND, side_effect=RuntimeError("boom")):
            result = notify_attempt_finished.apply(args=(str(a.id),))
        self.assertTrue(result.successful())


@override_settings(**CONF)
class TriggerTests(TelegramBase):
    def finish_with_commit(self, token, expect=200):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.anon.post(f"/api/v1/public/attempts/{token}/finish/")
        self.assertEqual(r.status_code, expect)
        return r

    def test_double_finish_queues_one_task(self):
        token = self.start(self.test).json()["access_token"]
        with mock.patch("apps.attempts.tasks.notify_attempt_finished.delay") as delay:
            self.finish_with_commit(token)
            self.finish_with_commit(token)
        self.assertEqual(delay.call_count, 1)

    def test_lazy_expiry_also_queues(self):
        test = make_published(self.subj_a1, "Vaqtli", time_limit_sec=60)
        token = self.start(test).json()["access_token"]
        self.age_attempt(token, 5)
        with mock.patch("apps.attempts.tasks.notify_attempt_finished.delay") as delay, self.captureOnCommitCallbacks(
            execute=True
        ):
            self.anon.get(f"/api/v1/public/attempts/{token}/")
        self.assertEqual(delay.call_count, 1)

    def test_broker_failure_does_not_break_student(self):
        token = self.start(self.test).json()["access_token"]
        with mock.patch("apps.attempts.tasks.notify_attempt_finished.delay", side_effect=ConnectionError("redis down")):
            r = self.finish_with_commit(token)
        self.assertIn("status", r.json())
        self.assertEqual(Attempt.objects.get(access_token=token).status, "finished")

    def test_nothing_queued_when_unconfigured(self):
        token = self.start(self.test).json()["access_token"]
        with override_settings(TELEGRAM_BOT_TOKEN=""), mock.patch(
            "apps.attempts.tasks.notify_attempt_finished.delay"
        ) as delay:
            self.finish_with_commit(token)
        self.assertFalse(delay.called)


@override_settings(**CONF)
class TransportTests(TelegramBase):
    def http_error(self, code, body):
        return urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(json.dumps(body).encode()))

    def test_429_carries_retry_after(self):
        err = self.http_error(429, {"description": "Too Many", "parameters": {"retry_after": 12}})
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(telegram.TelegramError) as cm:
                telegram.send_message("1", "x")
        self.assertTrue(cm.exception.retryable)
        self.assertEqual(cm.exception.retry_after, 12)

    def test_4xx_is_permanent_and_token_not_leaked(self):
        err = self.http_error(400, {"description": "Bad Request: chat not found"})
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(telegram.TelegramError) as cm:
                telegram.send_message("1", "x")
        self.assertFalse(cm.exception.retryable)
        self.assertNotIn("SECRET-TOKEN", str(cm.exception))

    def test_network_error_is_retryable(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("dns")):
            with self.assertRaises(telegram.TelegramError) as cm:
                telegram.send_message("1", "x")
        self.assertTrue(cm.exception.retryable)


class CommandTests(TelegramBase):
    def test_requires_token(self):
        with override_settings(TELEGRAM_BOT_TOKEN=""), self.assertRaises(CommandError):
            call_command("telegram_test")

    @override_settings(**CONF)
    def test_success(self):
        out = io.StringIO()
        with mock.patch.object(telegram, "api_call", return_value={"username": "test_bot"}), mock.patch(SEND) as send:
            call_command("telegram_test", stdout=out)
        self.assertIn("@test_bot", out.getvalue())
        self.assertNotIn("SECRET-TOKEN", out.getvalue())
        self.assertEqual(send.call_args.args[0], "-100shared")

    @override_settings(**CONF)
    def test_bad_chat_reports_clear_error(self):
        err = telegram.TelegramError("chat not found", retryable=False)
        with mock.patch.object(telegram, "api_call", return_value={"username": "b"}), mock.patch(SEND, side_effect=err):
            with self.assertRaises(CommandError) as cm:
                call_command("telegram_test")
        self.assertIn("chat not found", str(cm.exception))


class BranchChatPermissionTests(TelegramBase):
    def test_only_superadmin_can_set_and_see_chat_id(self):
        url = f"/api/v1/branches/{self.a.id}/"
        r = self.as_user(self.admin_a).patch(url, {"telegram_chat_id": "-1001"}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.as_user(self.root).patch(url, {"telegram_chat_id": "-1001234567890"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["telegram_chat_id"], "-1001234567890")
        self.assertNotIn("telegram_chat_id", self.as_user(self.admin_a).get(url).json())
        self.assertNotIn("telegram_chat_id", self.as_user(self.teacher_a).get(url).json())

    def test_chat_id_validated(self):
        r = self.as_user(self.root).patch(
            f"/api/v1/branches/{self.a.id}/", {"telegram_chat_id": "abc def"}, format="json"
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("telegram_chat_id", r.json())
