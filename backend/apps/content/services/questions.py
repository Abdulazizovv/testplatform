from django.db import transaction
from django.db.models import Max

from ..models import Option, Question, TestStatus
from .errors import ContentError
from .validation import question_instance_problems

QUESTION_FIELDS = ("type", "body_format", "body_src", "image", "explanation", "points")


@transaction.atomic
def save_question(test, data, instance=None):
    """
    Create or update a question together with its options (one atomic unit).

    `data` = validated serializer data; `options` (optional) is the FULL ordered list of
    options: items with an `id` update that option, items without one create a new option,
    existing options not mentioned are deleted. Draft tests may stay incomplete; a
    published test must remain fully valid or the whole save is rolled back.
    """
    data = dict(data)
    options = data.pop("options", None)

    if instance is None:
        last = test.questions.aggregate(m=Max("order"))["m"]
        question = Question(test=test, order=0 if last is None else last + 1)
        format_changed = False
    else:
        question = instance
        format_changed = data.get("body_format", question.body_format) != question.body_format
    for field in QUESTION_FIELDS:
        if field in data:
            setattr(question, field, data[field])
    question.save()

    if options is not None:
        _sync_options(question, options)
    elif format_changed:
        for option in question.options.all():
            option.question = question
            option.save()  # re-render html in the new format

    if test.status == TestStatus.PUBLISHED:
        question.refresh_from_db()  # drops any stale prefetched options
        problems = question_instance_problems(question)
        if problems:
            raise ContentError(
                "E'lon qilingan testdagi savol to'liq bo'lishi shart.",
                [{"problems": problems}],
            )
    return question


def _sync_options(question, items):
    existing = {o.id: o for o in question.options.all()}
    seen = set()
    for order, item in enumerate(items):
        option_id = item.get("id")
        if option_id is not None:
            if option_id not in existing or option_id in seen:
                raise ContentError("Variant shu savolga tegishli emas.")
            seen.add(option_id)
            option = existing[option_id]
        else:
            option = Option(question=question)
        option.question = question
        option.order = order
        option.text_src = item.get("text_src", "")
        option.image = item.get("image")
        option.is_correct = item.get("is_correct", False)
        option.save()
    stale = [oid for oid in existing if oid not in seen]
    if stale:
        Option.objects.filter(pk__in=stale).delete()
