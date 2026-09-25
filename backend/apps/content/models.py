from django.conf import settings
from django.db import models

from apps.core.models import BaseModel

from .services.sanitize import render_rich


class Subject(BaseModel):
    """A subject (fan). Belongs to exactly ONE branch; teachers are assigned via User.subjects."""

    branch = models.ForeignKey(
        "branches.Branch", verbose_name="Filial", on_delete=models.PROTECT, related_name="subjects"
    )
    name = models.CharField("Nomi", max_length=200)
    slug = models.SlugField("Slug", max_length=80)
    description = models.TextField("Tavsif", blank=True)
    is_active = models.BooleanField("Faol", default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Fan"
        verbose_name_plural = "Fanlar"
        constraints = [
            models.UniqueConstraint(fields=["branch", "slug"], name="subject_slug_unique_per_branch"),
        ]

    def __str__(self):
        return self.name


class MediaAsset(BaseModel):
    """
    An uploaded, re-encoded image (jpeg/png/webp). Belongs to one branch; identical
    content (sha256 of the re-encoded bytes) is stored once per branch.
    """

    branch = models.ForeignKey(
        "branches.Branch", verbose_name="Filial", on_delete=models.PROTECT, related_name="media_assets"
    )
    file = models.FileField("Fayl", upload_to="uploads/", max_length=255)
    sha256 = models.CharField(max_length=64)
    mime = models.CharField(max_length=50)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size = models.PositiveIntegerField(help_text="bytes")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Media"
        verbose_name_plural = "Media"
        constraints = [
            models.UniqueConstraint(fields=["branch", "sha256"], name="media_sha256_unique_per_branch"),
        ]

    @property
    def url(self):
        return self.file.url

    def __str__(self):
        return f"{self.file.name} ({self.mime})"


class TestStatus(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    PUBLISHED = "published", "E'lon qilingan"
    ARCHIVED = "archived", "Arxivlangan"


class ResultVisibility(models.TextChoices):
    NONE = "none", "Ko'rsatilmaydi"
    SCORE = "score", "Faqat ball"
    FULL = "full", "To'liq (javoblar bilan)"


class Test(BaseModel):
    """
    A test inside a subject. `branch` is denormalised from `subject` (set in save()) so
    scope_for can filter without a join. Only `published` tests become visible to
    students (Phase 2).
    """

    __test__ = False  # not a unittest/pytest case despite the name

    subject = models.ForeignKey(
        Subject, verbose_name="Fan", on_delete=models.CASCADE, related_name="tests"
    )
    branch = models.ForeignKey(
        "branches.Branch",
        verbose_name="Filial",
        on_delete=models.PROTECT,
        related_name="tests",
        editable=False,
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Muallif",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="authored_tests",
    )
    title = models.CharField("Sarlavha", max_length=250)
    description_src = models.TextField("Tavsif (markdown)", blank=True)
    description_html = models.TextField(blank=True, editable=False)
    status = models.CharField(
        max_length=20, choices=TestStatus.choices, default=TestStatus.DRAFT, db_index=True
    )
    time_limit_sec = models.PositiveIntegerField(
        "Vaqt chegarasi (soniya)", null=True, blank=True, help_text="Bo'sh = cheksiz"
    )
    pass_percent = models.PositiveSmallIntegerField("O'tish foizi", default=60)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_options = models.BooleanField(default=False)
    result_visibility = models.CharField(
        max_length=10, choices=ResultVisibility.choices, default=ResultVisibility.SCORE
    )
    max_attempts = models.PositiveIntegerField(null=True, blank=True, help_text="Bo'sh = cheksiz")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Test"
        verbose_name_plural = "Testlar"
        constraints = [
            models.CheckConstraint(
                name="test_pass_percent_range",
                condition=models.Q(pass_percent__gte=0, pass_percent__lte=100),
            ),
        ]

    def save(self, *args, **kwargs):
        self.branch_id = self.subject.branch_id
        self.description_html = render_rich("md", self.description_src)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class QuestionType(models.TextChoices):
    SINGLE = "single", "Bitta to'g'ri javob"
    MULTIPLE = "multiple", "Bir nechta to'g'ri javob"
    TEXT = "text", "Yoziladigan javob"  # reserved: cannot be created through the API yet


class BodyFormat(models.TextChoices):
    MARKDOWN = "md", "Markdown"
    HTML = "html", "HTML"


class Question(BaseModel):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField(default=0)
    type = models.CharField(max_length=10, choices=QuestionType.choices, default=QuestionType.SINGLE)
    body_format = models.CharField(max_length=4, choices=BodyFormat.choices, default=BodyFormat.MARKDOWN)
    body_src = models.TextField(blank=True)
    body_html = models.TextField(blank=True, editable=False)
    image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    explanation = models.TextField(blank=True, help_text="Izoh (body_format formatida)")
    explanation_html = models.TextField(blank=True, editable=False)
    points = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order", "created_at"]
        verbose_name = "Savol"
        verbose_name_plural = "Savollar"

    def save(self, *args, **kwargs):
        self.body_html = render_rich(self.body_format, self.body_src)
        self.explanation_html = render_rich(self.body_format, self.explanation)
        super().save(*args, **kwargs)


class Option(BaseModel):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    order = models.PositiveIntegerField(default=0)
    text_src = models.TextField(blank=True)
    text_html = models.TextField(blank=True, editable=False)
    image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_correct = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "created_at"]
        verbose_name = "Variant"
        verbose_name_plural = "Variantlar"

    def save(self, *args, **kwargs):
        self.text_html = render_rich(self.question.body_format, self.text_src)
        super().save(*args, **kwargs)
