"""Pure grading rules. Multiple choice is all-or-nothing (decision #27)."""


def grade_item(snapshot, selected_ids):
    """Return (is_correct, points_awarded) for one item."""
    correct = {o["id"] for o in snapshot["options"] if o["is_correct"]}
    chosen = set(selected_ids)
    ok = bool(chosen) and chosen == correct
    return ok, (snapshot["points"] if ok else 0)


def summarize(score, max_score, pass_percent):
    """Return (percent, passed); percent is rounded to 2 decimals."""
    percent = round(score * 100 / max_score, 2) if max_score else 0
    return percent, percent >= pass_percent
