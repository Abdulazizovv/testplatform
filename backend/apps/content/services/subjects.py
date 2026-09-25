"""Deep-copy services: subject clone (any branch) and test duplicate (same branch)."""

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils.text import slugify

from ..models import MediaAsset, Option, Question, Subject, Test, TestStatus
from .media import copy_asset_to_branch
from .sanitize import MEDIA_NAME_RE, render_rich


def unique_slug(branch, base, exclude_pk=None):
    base = (slugify(base) or "fan")[:70]
    qs = Subject.objects.filter(branch=branch)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    taken = set(qs.filter(slug__startswith=base).values_list("slug", flat=True))
    slug, n = base, 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    return slug


class _MediaRemap:
    """Maps media of the source branch to the target branch (identity inside one branch)."""

    def __init__(self, source_branch_id, target_branch, created_files):
        self.source_branch_id = source_branch_id
        self.target_branch = target_branch
        self.created_files = created_files
        self.same = source_branch_id == target_branch.id
        self._cache = {}

    def asset_id(self, asset_id):
        if asset_id is None or self.same:
            return asset_id
        if asset_id not in self._cache:
            source = MediaAsset.objects.get(pk=asset_id)
            self._cache[asset_id] = copy_asset_to_branch(source, self.target_branch, self.created_files)
        return self._cache[asset_id].id

    def text(self, text):
        if self.same or not text:
            return text

        def repl(match):
            name = match.group(1)
            source = MediaAsset.objects.filter(branch_id=self.source_branch_id, file=name).first()
            if source is None:
                return match.group(0)
            new = copy_asset_to_branch(source, self.target_branch, self.created_files)
            return f"{settings.MEDIA_URL}{new.file.name}"

        return MEDIA_NAME_RE.sub(repl, text)


def _copy_test(source, subject, author, title, remap):
    """Copy one test (as draft) with all questions/options into `subject`."""
    test = Test(
        subject=subject, author=author, title=title,
        description_src=remap.text(source.description_src),
        status=TestStatus.DRAFT, time_limit_sec=source.time_limit_sec,
        pass_percent=source.pass_percent, shuffle_questions=source.shuffle_questions,
        shuffle_options=source.shuffle_options, result_visibility=source.result_visibility,
        max_attempts=source.max_attempts,
    )  # fmt: skip
    test.save()

    questions, options = [], []
    for q in source.questions.prefetch_related("options").order_by("order", "created_at"):
        body_src = remap.text(q.body_src)
        explanation = remap.text(q.explanation)
        new_q = Question(
            test=test, order=q.order, type=q.type, body_format=q.body_format,
            body_src=body_src, body_html=render_rich(q.body_format, body_src),
            image_id=remap.asset_id(q.image_id), explanation=explanation,
            explanation_html=render_rich(q.body_format, explanation), points=q.points,
        )  # fmt: skip
        questions.append(new_q)
        for o in q.options.all():
            text_src = remap.text(o.text_src)
            options.append(Option(
                question=new_q, order=o.order, text_src=text_src,
                text_html=render_rich(q.body_format, text_src),
                image_id=remap.asset_id(o.image_id), is_correct=o.is_correct,
            ))  # fmt: skip
    Question.objects.bulk_create(questions)
    Option.objects.bulk_create(options)
    return test


def clone_subject(subject, target_branch, author, name=None):
    """
    Copy `subject` with ALL its tests/questions/options (as drafts) into `target_branch`.
    Teacher assignments are not copied. One DB transaction; files copied for media are
    removed again if anything fails.
    """
    created_files = []
    try:
        with transaction.atomic():
            same_branch = subject.branch_id == target_branch.id
            new_name = name or (f"{subject.name} (nusxa)" if same_branch else subject.name)
            new_subject = Subject.objects.create(
                branch=target_branch, name=new_name,
                slug=unique_slug(target_branch, name or subject.slug),
                description=subject.description, is_active=subject.is_active,
            )  # fmt: skip
            remap = _MediaRemap(subject.branch_id, target_branch, created_files)
            for test in subject.tests.order_by("created_at"):
                _copy_test(test, new_subject, author, test.title, remap)
            return new_subject
    except Exception:
        for file_name in created_files:
            default_storage.delete(file_name)
        raise


@transaction.atomic
def duplicate_test(test, target_subject, author, title=None):
    """Copy a test (draft) into `target_subject` of the SAME branch."""
    remap = _MediaRemap(test.branch_id, target_subject.branch, [])
    return _copy_test(test, target_subject, author, title or f"{test.title} (nusxa)"[:250], remap)
