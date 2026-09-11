"""Domain models, and the coercion that keeps a bad parse survivable.

Ported from the hand-written validators in src/lib/ai/parse-entry.ts.

The thing to understand before editing any of this: **these models degrade, they
do not reject.** An invalid `type` becomes "log" *and* records "type" in
`uncertain_fields`, which is what drives the `needs_review` badge in the UI.
Pydantic's instinct is to raise, and raising here would turn a flagged entry
into a failed request — the user would lose what they just typed instead of
getting a saved row with a "check this" marker on it.

So every field is coerced in a `mode="before"` validator that accumulates
uncertainty as it goes, and the declared field types below describe what is
true *after* that pass.

Field names are snake_case rather than the TypeScript camelCase. The prompt is
being rewritten anyway and these become tool-argument schemas, where snake_case
is the idiom.
"""

import math
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, model_validator

EntryType = Literal["task", "log", "event"]

ENTRY_TYPES: frozenset[str] = frozenset({"task", "log", "event"})

# Anything the model names outside this set is dropped rather than trusted, so
# a hallucinated field name can't light up the needs_review badge for a field
# that doesn't exist.
KNOWN_FIELDS: frozenset[str] = frozenset(
    {
        "type",
        "category",
        "title",
        "body",
        "due_at",
        "occurred_at",
        "ends_at",
        "all_day",
        "repeat",
        "amount",
        "currency",
    }
)

FALLBACK_TITLE_LIMIT = 120


def _aware(d: datetime) -> datetime:
    # Naive means the model omitted an offset despite being told to include
    # one. Treat it as UTC rather than guessing the host's zone, which on
    # Lambda is UTC and on a laptop is not.
    return d.replace(tzinfo=UTC) if d.tzinfo is None else d


def _iso_or_none(value: Any) -> datetime | None:
    """Parse an ISO 8601 string, or give up quietly.

    Stricter than the TypeScript original, which used `new Date(v)` and would
    accept things like "August 10, 2026". The prompt asks for ISO 8601, and
    silently accepting other formats is how an ambiguous date becomes a wrong
    date. Anything unparseable becomes None, exactly as before.
    """
    if isinstance(value, datetime):
        return _aware(value)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return _aware(datetime.fromisoformat(value.strip()))
    except ValueError:
        return None


def _clean_str(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _finite_number(value: Any) -> float | None:
    # bool is an int in Python, and True would otherwise become an amount of 1.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


class RepeatRule(BaseModel):
    """Weekly only.

    Anything richer is an RRULE, and an RRULE cannot be materialized into
    independently editable rows without inventing an exception model — which
    is the complexity the materialized-rows design exists to avoid.
    """

    freq: Literal["weekly"] = "weekly"
    until: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


def _coerce_repeat(value: Any) -> RepeatRule | None:
    if not isinstance(value, dict) or value.get("freq") != "weekly":
        return None
    until = value.get("until")
    if not isinstance(until, str):
        return None
    try:
        datetime.fromisoformat(until)
    except ValueError:
        return None
    return RepeatRule(freq="weekly", until=until)


class EntryDraft(BaseModel):
    """One thing the user is logging.

    Built via `EntryDraft.model_validate(raw, context={"fallback_title": ...})`
    so a missing title can fall back to the user's own words rather than
    failing the whole message.
    """

    model_config = ConfigDict(populate_by_name=True)

    type: EntryType
    category: str
    title: str
    body: str | None
    due_at: datetime | None
    occurred_at: datetime | None
    ends_at: datetime | None
    all_day: bool
    repeat: RepeatRule | None
    amount: float | None
    currency: str | None
    uncertain_fields: list[str]
    reason: str | None

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data: Any, info: ValidationInfo) -> Any:
        if not isinstance(data, dict):
            data = {}
        fallback = str((info.context or {}).get("fallback_title") or "")

        # A list, not a set: order is stable so tests and the UI badge read the
        # same way every run.
        uncertain: list[str] = []

        def flag(name: str) -> None:
            if name not in uncertain:
                uncertain.append(name)

        declared = data.get("uncertain_fields")
        if isinstance(declared, list):
            for field in declared:
                if isinstance(field, str) and field in KNOWN_FIELDS:
                    flag(field)

        raw_type = data.get("type")
        if isinstance(raw_type, str) and raw_type in ENTRY_TYPES:
            entry_type = raw_type
        else:
            entry_type = "log"
            flag("type")

        title = _clean_str(data.get("title"))
        if title is None:
            title = fallback[:FALLBACK_TITLE_LIMIT]
            flag("title")

        occurred_at = _iso_or_none(data.get("occurred_at"))
        ends_at = _iso_or_none(data.get("ends_at"))
        # Events only, and only forward in time. An end before its start is not
        # a duration, so it is dropped rather than stored as a negative-length
        # event every calendar reader would have to defend against.
        if not (entry_type == "event" and ends_at and occurred_at and ends_at > occurred_at):
            ends_at = None

        amount = _finite_number(data.get("amount"))
        if amount is None:
            currency = None
        else:
            # Default SGD, not USD. A bare "$" here means Singapore dollars.
            currency = (_clean_str(data.get("currency")) or "sgd").upper()

        return {
            "type": entry_type,
            "category": (_clean_str(data.get("category")) or "other").lower(),
            "title": title,
            "body": _clean_str(data.get("body")),
            "due_at": _iso_or_none(data.get("due_at")),
            "occurred_at": occurred_at,
            "ends_at": ends_at,
            # Always false for a task or a log, whatever the model claims: a
            # task being due on a date is not the same as filling that date.
            "all_day": data.get("all_day") is True and entry_type == "event",
            "repeat": _coerce_repeat(data.get("repeat")),
            "amount": amount,
            "currency": currency,
            "uncertain_fields": uncertain,
            "reason": _clean_str(data.get("reason")),
        }

    @property
    def needs_review(self) -> bool:
        return len(self.uncertain_fields) > 0


class EntryUpdates(BaseModel):
    """A partial edit: only the fields the model actually asked to change.

    Unset and explicitly-null are different here. Omitting `body` leaves it
    alone; sending `body: null` clears it. Callers must therefore use
    `model_dump(exclude_unset=True)` — a plain dump would blank every field
    the model never mentioned.

    Invalid values are stripped in the before-validator so they stay *unset*
    rather than arriving as an explicit null, which would clear the field the
    model failed to express an opinion about.
    """

    model_config = ConfigDict(populate_by_name=True)

    type: EntryType | None = None
    category: str | None = None
    title: str | None = None
    body: str | None = None
    due_at: datetime | None = None
    amount: float | None = None
    currency: str | None = None
    occurred_at: datetime | None = None
    status: Literal["open", "done"] | None = None

    @model_validator(mode="before")
    @classmethod
    def _strip_invalid(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return {}
        out: dict[str, Any] = {}

        raw_type = data.get("type")
        if isinstance(raw_type, str) and raw_type in ENTRY_TYPES:
            out["type"] = raw_type

        if (category := _clean_str(data.get("category"))) is not None:
            out["category"] = category.lower()

        if (title := _clean_str(data.get("title"))) is not None:
            out["title"] = title

        # Explicit null is meaningful for these two: it means "clear it".
        if "body" in data:
            if data["body"] is None:
                out["body"] = None
            elif (body := _clean_str(data["body"])) is not None:
                out["body"] = body

        if "due_at" in data:
            if data["due_at"] is None:
                out["due_at"] = None
            elif (due := _iso_or_none(data["due_at"])) is not None:
                out["due_at"] = due

        if (amount := _finite_number(data.get("amount"))) is not None:
            out["amount"] = amount

        if (currency := _clean_str(data.get("currency"))) is not None:
            out["currency"] = currency.upper()

        if (occurred := _iso_or_none(data.get("occurred_at"))) is not None:
            out["occurred_at"] = occurred

        if data.get("status") in ("open", "done"):
            out["status"] = data["status"]

        return out
