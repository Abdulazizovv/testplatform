"""
Completeness rules for questions. Pure functions over plain data, so the same rules run
in the serializer (saving into a published test) and in the publish action (from the DB).

Drafts may be saved incomplete; a test can only become `published` when EVERY question
passes `question_problems`.
"""

from ..models import QuestionType
from .errors import ContentError


def question_problems(qtype, body_src, has_image, options):
    """
    `options` is an iterable of (text_src, has_image, is_correct).
    Returns a list of Uzbek problem strings (empty = valid).
    """
    problems = []
    if qtype == QuestionType.TEXT:
        return ["Yoziladigan savollar keyingi bosqichda."]
    if not (body_src or "").strip() and not has_image:
        problems.append("Savol matni yoki rasmi bo'lishi shart.")
    options = list(options)
    if len(options) < 2:
        problems.append("Kamida 2 ta variant bo'lishi kerak.")
    for i, (text, img, _) in enumerate(options, start=1):
        if not (text or "").strip() and not img:
            problems.append(f"{i}-variant bo'sh: matn yoki rasm kiriting.")
    correct = sum(1 for _, _, ok in options if ok)
    if qtype == QuestionType.SINGLE and correct != 1:
        problems.append("Bitta javobli savolda aynan 1 ta to'g'ri variant bo'lishi kerak.")
    if qtype == QuestionType.MULTIPLE and correct < 1:
        problems.append("Kamida 1 ta to'g'ri variant belgilang.")
    return problems


def question_instance_problems(question):
    return question_problems(
        question.type,
        question.body_src,
        question.image_id is not None,
        [(o.text_src, o.image_id is not None, o.is_correct) for o in question.options.all()],
    )


def assert_test_publishable(test):
    """Raises ContentError listing every broken question."""
    questions = list(test.questions.prefetch_related("options").order_by("order", "created_at"))
    if not questions:
        raise ContentError("Testda kamida 1 ta savol bo'lishi kerak.")
    errors = []
    for number, q in enumerate(questions, start=1):
        problems = question_instance_problems(q)
        if problems:
            errors.append({"question_id": str(q.id), "number": number, "problems": problems})
    if errors:
        raise ContentError("Test e'lon qilinmadi: ba'zi savollarda xatolar bor.", errors)
