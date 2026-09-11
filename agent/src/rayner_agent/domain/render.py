"""How search results are shown to the model.

This is prompt design wearing a data-formatting hat. A tool's return value has
no schema: it is stringified and read as text, so its shape changes accuracy as
much as the system prompt does.

Ported from describeCandidate in parse-entry.ts, with the fix that motivated
half this project. The TypeScript version rendered type, category, title, body,
due date, amount and status, but **never occurred_at**. So when the user said
"the gym thing from last week", the model could not see when anything happened
and had no basis to choose, even with the right row in front of it.

Dates are rendered relative as well as absolute. "3 days ago" is what the user
actually said; an ISO timestamp makes the model do arithmetic it is bad at.
"""

from datetime import datetime
from typing import Any

from rayner_agent.domain.timezone import now_sgt, sgt_date_key


def _days_between(then: str, now: datetime) -> int:
    """Whole SGT calendar days, not 24-hour blocks.

    Built from day keys so that 11pm yesterday to 1am today is "yesterday",
    which is what a person means, rather than "0 days ago".
    """
    a = datetime.fromisoformat(sgt_date_key(then))
    b = datetime.fromisoformat(sgt_date_key(now))
    return (b - a).days


def relative_day(iso: str, now: datetime | None = None) -> str:
    now = now or now_sgt()
    try:
        days = _days_between(iso, now)
    except ValueError:
        return iso[:10]

    if days == 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days == -1:
        return "tomorrow"
    if days > 1:
        return f"{days} days ago"
    return f"in {abs(days)} days"


def describe_candidate(row: dict[str, Any], now: datetime | None = None) -> str:
    """One search result, as one line the model can compare against others."""
    bits: list[str] = [row["type"], row.get("category") or "other", f'"{row["title"]}"']

    if row.get("body"):
        bits.append(str(row["body"])[:120])

    when = row.get("occurred_at")
    if when:
        bits.append(f"{relative_day(when, now)} ({str(when)[:10]})")

    if row.get("due_at"):
        bits.append(f"due {relative_day(row['due_at'], now)} ({str(row['due_at'])[:10]})")

    if row.get("amount") is not None:
        bits.append(f"{row.get('currency') or ''} {row['amount']}".strip())

    if row.get("status"):
        bits.append(str(row["status"]))

    # Flagged so the model knows a whole series is behind this row, and that
    # deleting it means choosing occurrence or series.
    if row.get("series_id"):
        bits.append("part of a repeating series")

    return f"{' · '.join(bits)} [id={row['id']}]"


def describe_candidates(rows: list[dict[str, Any]], now: datetime | None = None) -> str:
    if not rows:
        return "No matching entries found."
    lines = [f"{i}. {describe_candidate(r, now)}" for i, r in enumerate(rows, 1)]
    return "\n".join(lines)
