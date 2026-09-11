"""Weekly recurrence, materialized into rows.

Ported from expandWeekly in src/lib/calendar.ts. Recurring events become
ordinary rows sharing a series_id rather than a rule evaluated at read time,
so each occurrence is independently editable, tickable, deletable and
searchable. Storage is free at this scale, and every hard recurrence problem
(edit this one or all, exceptions, per-instance state) disappears.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from rayner_agent.domain.timezone import sgt_day_end

# Bounds what one message can insert. "Every monday" with a far-off end date
# is a plausible thing to type, and each occurrence is a real row.
MAX_SERIES_OCCURRENCES = 60

# Exact because Singapore has no DST, so wall-clock time never drifts across
# occurrences.
_WEEK = timedelta(days=7)


@dataclass(frozen=True)
class Occurrence:
    occurred_at: datetime
    ends_at: datetime | None


def expand_weekly(
    start: datetime,
    ends_at: datetime | None,
    until_key: str,
) -> list[Occurrence]:
    duration = (ends_at - start) if ends_at is not None else None
    limit = sgt_day_end(until_key)

    out: list[Occurrence] = []
    for i in range(MAX_SERIES_OCCURRENCES):
        at = start + i * _WEEK
        # The first occurrence always lands, even when the end date parses to
        # something before it, so a bad rule degrades to one entry instead of
        # silently dropping what the user just said.
        if i > 0 and at > limit:
            break
        out.append(Occurrence(occurred_at=at, ends_at=at + duration if duration else None))
    return out
