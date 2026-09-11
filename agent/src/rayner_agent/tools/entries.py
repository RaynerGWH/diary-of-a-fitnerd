"""The agent's tools.

Two things worth understanding before editing anything here.

**The user id is never a tool argument.** Every tool reads it via
`config["configurable"]["user_id"]`, which the graph populates from the verified JWT.
`RunnableConfig` is stripped out of the schema the model sees, so the model
cannot set it, cannot see it, and cannot hallucinate one. The client holds
the service_role key and bypasses RLS, so this is the entire authorization
model.

**A tool's return value is prompt design.** There is no output schema: whatever
comes back is stringified and read by the model as text. So these return
rendered lines rather than raw JSON, and the wording is load-bearing.
"""

import asyncio
from typing import Annotated, Any, Literal

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from rayner_agent.db import entries as db_entries
from rayner_agent.domain.render import describe_candidates
from rayner_agent.domain.rows import draft_to_rows
from rayner_agent.domain.schemas import EntryDraft, EntryUpdates
from rayner_agent.domain.timezone import now_sgt

MAX_CANDIDATES = 8

def _user_id(config: RunnableConfig) -> str:
    user_id = (config.get("configurable") or {}).get("user_id")
    if not user_id:
        # No authenticated caller. Failing loudly beats running a query whose
        # only scoping filter is None, which the service_role key would
        # happily answer across every row in the table.
        raise RuntimeError("no user_id in config; refusing to touch the database")
    return str(user_id)

MAX_SPECS = 4


def _approved(decision: object) -> bool:
    """Read the human's answer out of whatever the resume passed back.

    Deliberately strict: anything that is not a clear yes counts as no, so a
    malformed resume leaves the entry alone rather than writing to it.
    """
    if isinstance(decision, bool):
        return decision
    if isinstance(decision, dict):
        return bool(decision.get("approved"))
    return str(decision).strip().lower() in {"yes", "y", "approve", "approved", "true"}


class SearchSpec(BaseModel):
    """One search. Any filters you set are combined with AND.

    Narrow when you are confident, broad when you are guessing, and send
    several at once. `category="school"` plus `days_back=7` is one precise
    query; if the guess is wrong it returns nothing, so pair it with a
    looser spec as a safety net. Several specs union their results, so
    breadth costs you nothing: they run concurrently and are deduplicated.
    """

    text: str | None = Field(
        default=None,
        description=(
            "Keywords to match in the title or body. Strip filler words: every "
            "term must match, so 'the gym thing from last week' finds nothing "
            "while 'gym' finds it. Put the timeframe in days_back instead."
        ),
    )
    category: str | None = Field(
        default=None,
        description=(
            "Usually one of: school, work, ra, gym, diet, expenditure, other. "
            "Use this when the user names an area of life rather than words "
            "that would appear in the entry itself."
        ),
    )
    days_back: int | None = Field(
        default=None,
        description="Only entries from the last N days. 'last week' is 7, 'this month' is 30.",
    )


@tool
async def search_entries(specs: list[SearchSpec], config: RunnableConfig) -> str:
    """Find entries the user might be referring to.

    Send several specs in one call rather than searching repeatedly: they run
    concurrently, so three cost roughly the wall-clock of one, and their
    results are merged and deduplicated.

    Pair a narrow spec with a broad one. "the school thing from last week" is
    best served by {category: "school", days_back: 7} for precision plus
    {text: "school"} in case it was filed elsewhere. Do not send the user's
    whole sentence as `text`; every word has to match.
    """
    user_id = _user_id(config)
    now = now_sgt()

    def run(spec: SearchSpec) -> list[dict[str, Any]]:
        return db_entries.search(
            user_id,
            text=spec.text,
            category=spec.category,
            days_back=spec.days_back,
            now=now,
        )

    # supabase-py is synchronous, so each call would otherwise block the event
    # loop and the "fan-out" would just be a sequential loop wearing a hat.
    # to_thread puts each on a worker thread and gather waits for all of them,
    # so N searches cost the slowest rather than the sum. That is the whole
    # reason this tool takes a list.
    results = await asyncio.gather(*(asyncio.to_thread(run, spec) for spec in specs[:MAX_SPECS]))

    # Dedupe across specs, first-seen order, so the earliest-planned search
    # ranks highest. Then truncate: forty rows costs tokens and makes the
    # model worse at choosing, not better.
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for row in (row for result in results for row in result):
        if row["id"] not in seen:
            seen.add(row["id"])
            merged.append(row)

    rendered = describe_candidates(merged[:MAX_CANDIDATES], now)
    if len(merged) > MAX_CANDIDATES:
        # Say so, or the model assumes it has seen everything and picks the
        # best of a truncated list instead of searching again.
        rendered += (
            f"\n\n({len(merged)} matched, showing {MAX_CANDIDATES}. "
            "Search again with narrower filters if none of these are right.)"
        )
    return rendered


@tool
def add_entries(entries: list[EntryDraft], config: RunnableConfig) -> str:
    """Save one or more new entries.

    Call this once with every distinct thing in the message. "pay rent and call
    mom tomorrow" is two entries in one call, not two calls. A sentence with a
    few extra clauses is still one entry.

    This ends the turn: do not follow it with `reply`. The confirmation the
    user sees is built from what was actually saved, so you do not write one.
    """
    user_id = _user_id(config)

    rows = [row for draft in entries for row in draft_to_rows(user_id, draft)]
    saved = db_entries.insert_entries(rows)

    # This string is what the user reads, not something the model paraphrases.
    # Built from the rows that actually landed, so it can never claim to have
    # saved something it didn't. That is the trade for losing the model's
    # casual phrasing: the reply costs no extra call and cannot lie.
    titles = [d.title for d in entries]
    if len(titles) == 1:
        summary = f"logged: {titles[0]}"
    else:
        summary = f"logged {len(titles)}: {', '.join(titles)}"

    # A weekly repeat turns one entry into many rows; say so, or "logged 1"
    # sitting next to 12 new calendar items looks like a bug.
    if len(saved) > len(entries):
        summary += f" ({len(saved)} occurrences)"

    flagged = sum(1 for d in entries if d.needs_review)
    if flagged:
        summary += f" · {flagged} needs a check"

    return summary


@tool
def edit_entry(entry_id: str, updates: EntryUpdates, config: RunnableConfig) -> str:
    """Change an existing entry. Only include fields that should change.

    Omitting a field leaves it alone. Sending null for body or due_at clears it.
    Never call this without having found the entry through search_entries first,
    and never guess an id.
    """
    user_id = _user_id(config)

    # exclude_unset is load-bearing: a plain dump would send null for every
    # field the model did not mention and blank the rest of the entry.
    patch = updates.model_dump(exclude_unset=True, mode="json")
    if not patch:
        return "No changes were specified, so nothing was updated."

    # Pause and ask before touching anything. Resolving *which* entry was
    # meant is the fallible step in this whole design, so the write never
    # happens on the model's say-so alone.
    #
    # Everything above this line runs again when the turn resumes, because a
    # resumed node re-executes from the top. Hence the write below it, not
    # above: otherwise confirming would apply the edit twice.
    decision = interrupt(
        {"action": "edit", "entry_id": entry_id, "changes": patch}
    )
    if not _approved(decision):
        return "ok, left it as it was"

    row = db_entries.update_entry(user_id, entry_id, patch)
    if row is None:
        return f"No entry with id {entry_id} belongs to this user; nothing was updated."
    return f"updated {', '.join(patch)} on \"{row['title']}\""


@tool
def delete_entry(
    target: str,
    scope: Annotated[Literal["occurrence", "series"], "occurrence unless the user means all of them"],
    config: RunnableConfig,
) -> str:
    """Delete an entry, or a whole repeating series.

    `target` is an entry id for scope=occurrence, or a series id for
    scope=series. "delete my tuesday tutorials" means the series; "delete
    tuesday's tutorial" means one occurrence. Ask via the confirmation rather
    than guessing when it is ambiguous.
    """
    user_id = _user_id(config)

    # Same gate as edit_entry, and for the same reason. The count goes in the
    # payload so the confirmation can say "this removes 12 occurrences"
    # rather than making the user guess what a series contains.
    affected = db_entries.count_series(user_id, target) if scope == "series" else 1
    decision = interrupt(
        {"action": "delete", "target": target, "scope": scope, "affected": affected}
    )
    if not _approved(decision):
        return "ok, left it alone"

    count = db_entries.soft_delete(user_id, target, scope)
    if count == 0:
        return f"Nothing matched {target} for this user; nothing was deleted."
    return f"deleted {count} entr{'y' if count == 1 else 'ies'}"


@tool
def reply(text: str) -> str:
    """Answer the user without saving anything.

    Use this when the message is not something to log and not an edit: a
    greeting, a question about what is already recorded, or anything you can
    answer from a search. Under 25 words, first person, casual, no emoji.
    """
    # Nothing to do. The graph reads the argument and ends; the call itself is
    # how the model signals "I am finished and this is what I want to say".
    return text


CAPTURE_TOOLS = [add_entries, search_entries, edit_entry, delete_entry, reply]
