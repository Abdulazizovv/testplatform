"""Staff results: filtering, aggregates, per-question analysis and the Excel export."""

from collections import Counter, defaultdict
from datetime import datetime
from io import BytesIO

from django.db.models import Avg, Count, Q
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from rest_framework import serializers

from apps.core.exceptions import BusinessError

from ..models import AttemptItem, AttemptStatus
from ..scoping import attempts_for
from .formatting import attempt_duration_sec, format_duration

EXPORT_LIMIT = 10_000
CLOSED = (AttemptStatus.FINISHED, AttemptStatus.EXPIRED)


class ResultFilterSerializer(serializers.Serializer):
    """Validates the query string; unknown parameters (page, page_size) are ignored."""

    test = serializers.UUIDField(required=False)
    subject = serializers.UUIDField(required=False)
    branch = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=AttemptStatus.values, required=False)
    passed = serializers.BooleanField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    search = serializers.CharField(required=False, max_length=60, allow_blank=True)


def filtered_attempts(user, params):
    """Scoped (attempts_for) + filtered queryset, newest first. In-progress runs only on request."""
    f = ResultFilterSerializer(data={k: v for k, v in params.items() if v != ""})
    f.is_valid(raise_exception=True)
    d = f.validated_data
    qs = attempts_for(user).select_related("test__subject", "branch")
    qs = qs.filter(status=d["status"]) if "status" in d else qs.filter(status__in=CLOSED)
    if "test" in d:
        qs = qs.filter(test_id=d["test"])
    if "subject" in d:
        qs = qs.filter(test__subject_id=d["subject"])
    if "branch" in d:
        qs = qs.filter(branch_id=d["branch"])
    if "passed" in d:
        qs = qs.filter(passed=d["passed"])
    if "date_from" in d:
        qs = qs.filter(started_at__date__gte=d["date_from"])
    if "date_to" in d:
        qs = qs.filter(started_at__date__lte=d["date_to"])
    if d.get("search"):
        qs = qs.filter(full_name__icontains=d["search"].strip())
    return qs.order_by("-started_at", "-id")


def summarize_attempts(qs):
    """Numbers over the filtered set only; averages ignore attempts that are not graded yet."""
    agg = qs.aggregate(
        total=Count("id"),
        graded=Count("id", filter=Q(percent__isnull=False)),
        passed=Count("id", filter=Q(passed=True)),
        avg=Avg("percent"),
    )
    graded = agg["graded"]
    return {
        "attempts": agg["total"],
        "avg_percent": round(float(agg["avg"]), 1) if agg["avg"] is not None else None,
        "pass_rate": round(agg["passed"] * 100 / graded, 1) if graded else None,
    }


def question_analysis(attempts_qs):
    """
    Per question: how often it was answered correctly and the most chosen WRONG option, from
    the frozen snapshots (a later edit of the test never changes it, decision #25).
    """
    items = (
        AttemptItem.objects.filter(attempt__in=attempts_qs.values("id"))
        .order_by("question__order", "attempt__started_at")
        .values_list(
            "question_id", "question__order", "question_snapshot", "selected_option_ids", "is_correct"
        )
        .iterator(chunk_size=500)
    )
    stats = {}
    wrong = defaultdict(Counter)
    for qid, order, snap, selected, ok in items:
        s = stats.setdefault(qid, {"order": order, "n": 0, "correct": 0})
        s["n"] += 1
        s["correct"] += 1 if ok else 0
        s["snap"] = snap  # the latest one wins: freshest wording
        if not ok:
            correct_ids = {o["id"] for o in snap["options"] if o["is_correct"]}
            for oid in selected or []:
                if oid not in correct_ids:
                    wrong[qid][oid] += 1
    out = []
    for number, (qid, s) in enumerate(sorted(stats.items(), key=lambda kv: kv[1]["order"]), start=1):
        snap = s["snap"]
        top = None
        if wrong[qid]:
            oid, cnt = wrong[qid].most_common(1)[0]
            option = next((o for o in snap["options"] if o["id"] == oid), None)
            if option:
                top = {
                    "option_id": oid,
                    "text_html": option.get("text_html", ""),
                    "image_url": option.get("image_url"),
                    "count": cnt,
                }
        out.append(
            {
                "question_id": str(qid),
                "order": number,
                "type": snap.get("type"),
                "body_html": snap.get("body_html", ""),
                "image_url": snap.get("image_url"),
                "answered_count": s["n"],
                "correct_count": s["correct"],
                "correct_percent": round(s["correct"] * 100 / s["n"], 1),
                "top_wrong_option": top,
            }
        )
    return out


# --- Excel export ---------------------------------------------------------------------------

EXPORT_HEADERS = [
    "Filial", "Fan", "Test", "Ism", "Yosh", "Ball", "Maks. ball", "Foiz", "O'tdi",
    "Holat", "Boshlangan", "Tugagan", "Davomiylik",
]
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


def safe_cell(ws, value):
    """
    Text that Excel could read as a formula (= + - @ ...) is neutralised twice: a leading
    apostrophe AND an explicit string cell type (CSV/formula injection).
    """
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        text = "'" + text
    cell = WriteOnlyCell(ws, value=text)
    cell.data_type = "s"
    return cell


def _local(dt):
    return timezone.localtime(dt).strftime("%Y-%m-%d %H:%M") if dt else ""


def build_workbook(qs):
    """xlsx bytes, streamed row by row (write_only). Refuses more than EXPORT_LIMIT rows."""
    count = qs.count()
    if count > EXPORT_LIMIT:
        raise BusinessError(
            f"Natijalar juda ko'p ({count} ta, ruxsat etilgani {EXPORT_LIMIT}). Filtrlarni toraytiring.",
            status_code=400,
        )
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Natijalar")
    ws.append(EXPORT_HEADERS)
    for a in qs.iterator(chunk_size=500):
        ws.append(
            [
                safe_cell(ws, a.branch.name),
                safe_cell(ws, a.test.subject.name),
                safe_cell(ws, a.test.title),
                safe_cell(ws, a.full_name),
                a.age,
                a.score,
                a.max_score,
                float(a.percent) if a.percent is not None else None,
                "Ha" if a.passed else ("Yo'q" if a.passed is False else ""),
                AttemptStatus(a.status).label,
                _local(a.started_at),
                _local(a.finished_at),
                format_duration(attempt_duration_sec(a)) if a.finished_at else "",
            ]
        )
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_filename():
    return f"natijalar-{datetime.now():%Y%m%d-%H%M}.xlsx"


def test_results_summary(user, test):
    qs = attempts_for(user).filter(test=test, status__in=CLOSED)
    return {
        "test": {"id": str(test.id), "title": test.title, "subject": test.subject.name},
        **summarize_attempts(qs),
        "questions": question_analysis(qs),
    }
