"""Singapore time, the only wall clock this app recognises.

Ported from src/lib/time.ts, which stays in TypeScript because the UI still
renders through it. Duplicated rather than moved — two copies of a fixed
offset is a cheaper problem than a network hop for a date format.

A fixed +08:00 offset is exactly correct, not an approximation: Singapore has
no DST and has been permanently UTC+8 for decades. That's what lets all of
this be arithmetic instead of a timezone database.
"""

from datetime import UTC, datetime, timedelta, timezone

SGT_OFFSET = "+08:00"
SGT = timezone(timedelta(hours=8))


def now_sgt() -> datetime:
    return datetime.now(SGT)


def _as_sgt(value: datetime | str) -> datetime:
    d = datetime.fromisoformat(value) if isinstance(value, str) else value
    # A naive datetime is treated as UTC, matching how JS parses a bare
    # timestamp. Guessing local time instead would silently shift by whatever
    # the host is set to, which on Lambda is UTC and on a laptop is not.
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d.astimezone(SGT)


def sgt_date_key(value: datetime | str | None = None) -> str:
    """"YYYY-MM-DD" for the SGT day an instant falls on."""
    return _as_sgt(value if value is not None else now_sgt()).strftime("%Y-%m-%d")


def sgt_day_end(date_key: str) -> datetime:
    """The last instant of an SGT day. Used as the inclusive bound on a series."""
    return datetime.fromisoformat(f"{date_key}T23:59:59.999{SGT_OFFSET}")


def sgt_weekday(value: datetime | str | None = None) -> str:
    return _as_sgt(value if value is not None else now_sgt()).strftime("%A")


def sgt_datetime_label(value: datetime | str | None = None) -> str:
    """Human-readable stamp for the prompt.

    The model needs the user's wall clock, not an instant, to resolve
    "tomorrow" or "friday". Lambda runs in UTC, where for the eight hours
    after SGT midnight the raw instant names the previous day — enough to
    resolve "friday" a day early.
    """
    return _as_sgt(value if value is not None else now_sgt()).strftime("%Y-%m-%d %H:%M")
