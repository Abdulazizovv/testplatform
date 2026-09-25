"""Shared fixtures for content/user API tests: two branches, staff for each, content builders."""

import io
import shutil
import tempfile

from django.core.cache import cache
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.content.models import Option, Question, Subject, Test
from apps.core.roles import Role

PASSWORD = "correct-horse-battery-1"


def make_image(fmt="PNG", size=(20, 10), color=(200, 30, 30), exif=False):
    """Bytes of a small valid image."""
    img = Image.new("RGB", size, color)
    out = io.BytesIO()
    kwargs = {}
    if exif:
        e = Image.Exif()
        e[0x010F] = "SecretCamera"  # Make
        e[0x0112] = 1
        kwargs["exif"] = e
    img.save(out, format=fmt, **kwargs)
    return out.getvalue()


def make_test(subject, author=None, title="Test", status="draft", questions=1):
    """A test with `questions` valid single-choice questions (2 options each, first correct)."""
    test = Test.objects.create(subject=subject, author=author, title=title, status=status)
    for i in range(questions):
        add_question(test, f"Savol {i + 1}")
    return test


def add_question(test, body="Savol", qtype="single", options=(("A", True), ("B", False))):
    q = Question.objects.create(test=test, order=test.questions.count(), type=qtype, body_src=body)
    for i, (text, ok) in enumerate(options):
        Option.objects.create(question=q, order=i, text_src=text, is_correct=ok)
    return q


class ContentAPITestCase(APITestCase):
    """Two branches, each with admin + teacher; superadmin; subjects a1/a2 (A), b1 (B)."""

    def _pre_setup(self):
        cache.clear()  # DRF throttle counters live in the shared cache
        super()._pre_setup()

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_dir = tempfile.mkdtemp(prefix="tp-media-")
        cls._override = override_settings(MEDIA_ROOT=cls._media_dir)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_dir, ignore_errors=True)
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        cls.a = Branch.objects.create(name="Filial A", slug="a")
        cls.b = Branch.objects.create(name="Filial B", slug="b")
        cls.root = User.objects.create_superuser("root", password=PASSWORD)
        mk = User.objects.create_user
        cls.admin_a = mk("admin_a", password=PASSWORD, role=Role.ADMIN, branch=cls.a)
        cls.admin_b = mk("admin_b", password=PASSWORD, role=Role.ADMIN, branch=cls.b)
        cls.teacher_a = mk("teacher_a", password=PASSWORD, role=Role.TEACHER, branch=cls.a)
        cls.teacher_a2 = mk("teacher_a2", password=PASSWORD, role=Role.TEACHER, branch=cls.a)
        cls.teacher_b = mk("teacher_b", password=PASSWORD, role=Role.TEACHER, branch=cls.b)
        cls.subj_a1 = Subject.objects.create(branch=cls.a, name="Matematika", slug="math")
        cls.subj_a2 = Subject.objects.create(branch=cls.a, name="Fizika", slug="physics")
        cls.subj_b1 = Subject.objects.create(branch=cls.b, name="Matematika", slug="math")
        cls.teacher_a.subjects.add(cls.subj_a1)
        cls.teacher_a2.subjects.add(cls.subj_a2)
        cls.teacher_b.subjects.add(cls.subj_b1)

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client
