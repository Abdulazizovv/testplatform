"""Small display helpers shared by the Telegram message and the Excel export."""


def format_duration(seconds):
    """'12 daq 30 s', '45 s', '1 soat 5 daq'; '-' when unknown."""
    if seconds is None or seconds < 0:
        return "-"
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    parts = []
    if hours:
        parts.append(f"{hours} soat")
    if minutes:
        parts.append(f"{minutes} daq")
    if secs and not hours:
        parts.append(f"{secs} s")
    return " ".join(parts) or "0 s"


def format_percent(value):
    """Decimal('70.00') -> '70', Decimal('66.67') -> '66.67'."""
    if value is None:
        return "-"
    return f"{float(value):g}"


def attempt_duration_sec(attempt):
    if attempt.finished_at is None or attempt.started_at is None:
        return None
    return max(0, int((attempt.finished_at - attempt.started_at).total_seconds()))
