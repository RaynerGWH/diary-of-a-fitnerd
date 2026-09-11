"""Turning a validated draft into the rows that actually go in the table.

One message can produce several drafts, and one draft with a weekly repeat
produces several rows. Both fan-outs live here, ported from chat-actions.ts.

Pure functions: no database, no clock beyond what you pass in, so the awkward
parts (a weekly series, a task's due date) are testable without Supabase.
"""

import uuid
from datetime import datetime
from typing import Any

from rayner_agent.domain.recurrence import expand_weekly
from rayner_agent.domain.schemas import EntryDraft
from rayner_agent.domain.timezone import now_sgt


def draft_to_rows(user_id: str, draft: EntryDraft, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or now_sgt()

    base: dict[str, Any] = {
        "user_id": user_id,
        "type": draft.type,
        "category": draft.category,
        "title": draft.title,
        "body": draft.body,
        # Only tasks carry a status. A log is not "open".
        "status": "open" if draft.type == "task" else None,
        "all_day": draft.all_day,
        "amount": draft.amount,
        "currency": draft.currency,
        # The uncertainty the parser recorded becomes the badge in the UI.
        "needs_review": draft.needs_review,
    }

    starts_at = draft.occurred_at or now

    if draft.repeat is None:
        return [
            {
                **base,
                "series_id": None,
                # A task belongs on the calendar by its due date, everything
                # else by when it happened.
                "due_at": draft.due_at.isoformat() if draft.type == "task" and draft.due_at else None,
                "occurred_at": starts_at.isoformat(),
                "ends_at": draft.ends_at.isoformat() if draft.ends_at else None,
            }
        ]

    # A weekly rule becomes N ordinary rows sharing a series_id, rather than a
    # rule the reader has to expand. Each occurrence is then independently
    # editable, tickable and deletable.
    series_id = str(uuid.uuid4())
    return [
        {
            **base,
            "series_id": series_id,
            "due_at": occ.occurred_at.isoformat() if draft.type == "task" else None,
            "occurred_at": occ.occurred_at.isoformat(),
            "ends_at": occ.ends_at.isoformat() if occ.ends_at else None,
        }
        for occ in expand_weekly(starts_at, draft.ends_at, draft.repeat.until)
    ]
