"""Reads and writes against `entries`.

Every function takes `user_id` explicitly and filters on it. The client holds
the service_role key and so bypasses RLS entirely: this filter is the only
thing scoping a query to one person's rows. See db/client.py.

Every read also filters `deleted_at is null`. Agent deletes are soft, because
resolving *which* entry the user meant is the fallible part and a wrong
resolution should not destroy a row.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from rayner_agent.db.client import db

# What a search hands back to the model. Deliberately not `select("*")`: the
# model does not need created_at, updated_at, source, or the tsvector, and
# every extra column is tokens spent on all N candidates.
CANDIDATE_COLUMNS = (
    "id,type,category,title,body,status,due_at,occurred_at,ends_at,"
    "all_day,amount,currency,series_id"
)

DEFAULT_LIMIT = 8


def _live(user_id: str):
    return (
        db()
        .table("entries")
        .select(CANDIDATE_COLUMNS)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
    )


def search(
    user_id: str,
    text: str | None = None,
    category: str | None = None,
    days_back: int | None = None,
    now: datetime | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[dict[str, Any]]:
    """One query, with whatever filters were given, ANDed together.

    Filters compose rather than being mutually exclusive, so the caller can
    ask a narrow question ("school entries from last week") in a single query
    instead of unioning two broad ones and getting everything in `school`
    plus everything from last week.

    Narrow is more precise and more brittle: one wrong guess and the
    intersection is empty. Breadth comes from running several of these, which
    is the caller's job.
    """
    if text is None and category is None and days_back is None:
        return []

    q = (
        db()
        .table("entries")
        .select(CANDIDATE_COLUMNS)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
    )

    if text and text.strip():
        # websearch_to_tsquery: tokenises, stems, and tolerates punctuation,
        # unlike the single ILIKE this replaced. Note it ANDs every term, so
        # filler words in the query still kill the match.
        q = q.filter("fts", "wfts(english)", text.strip())

    if category and category.strip():
        q = q.eq("category", category.strip().lower())

    if days_back:
        # occurred_at, NOT calendar_at. calendar_at is generated as due_at for
        # tasks, and an undated task has a null due_at, so filtering on it
        # silently drops most tasks from every date-bounded search. occurred_at
        # is `not null` and means "when this was logged", which is also closer
        # to what someone means by "the thing from last week".
        start = (now or datetime.now(UTC)) - timedelta(days=days_back)
        q = q.gte("occurred_at", start.isoformat())

    return q.order("occurred_at", desc=True).limit(limit).execute().data or []


def count_live(user_id: str) -> int:
    """Total live entries, so a truncated result set can say what it hid."""
    res = (
        db()
        .table("entries")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    return res.count or 0


def insert_entries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bulk insert. Callers build rows with user_id already set."""
    if not rows:
        return []
    return db().table("entries").insert(rows).execute().data or []


def update_entry(user_id: str, entry_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    """Patch one entry. `updates` must already exclude unset fields.

    A dict built without `exclude_unset=True` would blank every column the
    model never mentioned, so that is the caller's responsibility and this
    will faithfully write whatever it is handed.
    """
    if not updates:
        return None
    res = (
        db()
        .table("entries")
        .update({**updates, "updated_at": datetime.now().astimezone().isoformat()})
        .eq("id", entry_id)
        .eq("user_id", user_id)
        .execute()
    )
    return (res.data or [None])[0]


def soft_delete(user_id: str, target: str, scope: str = "occurrence") -> int:
    """Mark entries deleted. Returns how many rows were affected.

    `scope="series"` matches on series_id, so "delete my tuesday tutorials"
    removes the whole materialized set rather than one occurrence. Recurring
    events are ordinary rows sharing a series_id, so this is the only thing
    tying them together.
    """
    column = "series_id" if scope == "series" else "id"
    res = (
        db()
        .table("entries")
        .update({"deleted_at": datetime.now().astimezone().isoformat()})
        .eq(column, target)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .execute()
    )
    return len(res.data or [])


def count_series(user_id: str, series_id: str) -> int:
    """How many live occurrences a series has, for the confirm card."""
    res = (
        db()
        .table("entries")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("series_id", series_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    return res.count or 0
