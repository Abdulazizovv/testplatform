"""Freeze a test into attempt items (question order and option order included)."""

import random

from apps.content.models import QuestionType


def _image_url(asset):
    return asset.url if asset is not None else None


def question_snapshot(question, options):
    return {
        "type": question.type,
        "points": question.points,
        "body_html": question.body_html,
        "image_url": _image_url(question.image),
        "explanation_html": question.explanation_html,
        "options": [
            {
                "id": str(o.id),
                "text_html": o.text_html,
                "image_url": _image_url(o.image),
                "is_correct": o.is_correct,
            }
            for o in options
        ],
    }


def build_snapshots(test, seed):
    """
    (question, snapshot) pairs in DISPLAY order. Shuffling is driven by `seed` only, and the
    result is stored, so a page refresh never reorders anything.
    """
    rng = random.Random(seed)
    questions = list(
        test.questions.filter(type__in=[QuestionType.SINGLE, QuestionType.MULTIPLE])
        .select_related("image")
        .prefetch_related("options__image")
    )
    if test.shuffle_questions:
        rng.shuffle(questions)
    out = []
    for question in questions:
        options = list(question.options.all())
        if test.shuffle_options:
            rng.shuffle(options)
        out.append((question, question_snapshot(question, options)))
    return out
