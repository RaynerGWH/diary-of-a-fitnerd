"""Short-term memory: a checkpointer over the Supabase REST API.

LangGraph saves the graph's state after every step, keyed by thread_id. That
is what lets a conversation survive between HTTP requests, so "actually make
that $500" knows what "that" refers to.

Written by hand instead of using `langgraph-checkpoint-postgres` because that
library needs a direct Postgres connection on port 5432/6543, and this
deployment can only reach Supabase over HTTPS. Talking to the same PostgREST
endpoint as everything else means one connection path, no pooler, no
prepared-statement quirk, and it runs identically on a laptop and on Lambda.

Serialization is delegated to `self.serde`, the JsonPlusSerializer that
BaseCheckpointSaver provides. It returns `(type_tag, bytes)`; the bytes are
base64'd because these columns are text.

Threads are namespaced per user by the caller, not here: see thread_key().
"""

import base64
from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_checkpoint_id,
)

from rayner_agent.db.client import db

CHECKPOINTS = "agent_checkpoints"
WRITES = "agent_checkpoint_writes"


def thread_key(user_id: str, thread_id: str) -> str:
    """Namespace a thread by its owner.

    The checkpoint tables are keyed on thread_id alone, so without this a
    guessed or colliding thread id would read someone else's conversation.
    Single-user today, but the tables have no user_id column and this is
    cheaper than adding one later.
    """
    return f"{user_id}:{thread_id}"


def _encode(value: Any, serde: Any) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    type_tag, blob = serde.dumps_typed(value)
    return type_tag, base64.b64encode(blob).decode()


def _decode(type_tag: str | None, encoded: str | None, serde: Any) -> Any:
    if not encoded:
        return None
    return serde.loads_typed((type_tag or "json", base64.b64decode(encoded)))


class SupabaseCheckpointSaver(BaseCheckpointSaver):
    """Persists graph state through PostgREST.

    Only the async methods are implemented, because the graph is async. Sync
    callers would need the `*_tuple` variants; LangGraph raises a clear error
    rather than silently doing nothing if one is ever used.
    """

    def _row_to_tuple(self, row: dict[str, Any], pending: list) -> CheckpointTuple:
        checkpoint = _decode(row.get("type"), row["checkpoint"], self.serde)
        config: RunnableConfig = {
            "configurable": {
                "thread_id": row["thread_id"],
                "checkpoint_ns": row["checkpoint_ns"],
                "checkpoint_id": row["checkpoint_id"],
            }
        }
        parent = None
        if row.get("parent_checkpoint_id"):
            parent = {
                "configurable": {
                    "thread_id": row["thread_id"],
                    "checkpoint_ns": row["checkpoint_ns"],
                    "checkpoint_id": row["parent_checkpoint_id"],
                }
            }
        return CheckpointTuple(
            config=config,
            checkpoint=checkpoint,
            metadata=row.get("metadata") or {},
            parent_config=parent,
            pending_writes=pending,
        )

    def _pending_writes(self, thread_id: str, ns: str, checkpoint_id: str) -> list:
        rows = (
            db()
            .table(WRITES)
            .select("task_id,channel,type,value,idx")
            .eq("thread_id", thread_id)
            .eq("checkpoint_ns", ns)
            .eq("checkpoint_id", checkpoint_id)
            .order("idx")
            .execute()
            .data
            or []
        )
        return [
            (r["task_id"], r["channel"], _decode(r.get("type"), r.get("value"), self.serde))
            for r in rows
        ]

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        values = config.get("configurable") or {}
        thread_id = values.get("thread_id")
        if not thread_id:
            return None
        ns = values.get("checkpoint_ns", "")

        query = (
            db()
            .table(CHECKPOINTS)
            .select("*")
            .eq("thread_id", thread_id)
            .eq("checkpoint_ns", ns)
        )

        # An explicit checkpoint_id means "give me this exact step", which is
        # how time travel and replay work. Without one, resume from the newest.
        checkpoint_id = get_checkpoint_id(config)
        if checkpoint_id:
            query = query.eq("checkpoint_id", checkpoint_id)
        else:
            query = query.order("checkpoint_id", desc=True).limit(1)

        rows = query.execute().data or []
        if not rows:
            return None

        row = rows[0]
        pending = self._pending_writes(thread_id, ns, row["checkpoint_id"])
        return self._row_to_tuple(row, pending)

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        values = (config or {}).get("configurable") or {}
        query = db().table(CHECKPOINTS).select("*")

        if values.get("thread_id"):
            query = query.eq("thread_id", values["thread_id"])
        if values.get("checkpoint_ns") is not None:
            query = query.eq("checkpoint_ns", values.get("checkpoint_ns", ""))
        if before and (before_id := get_checkpoint_id(before)):
            query = query.lt("checkpoint_id", before_id)
        for key, value in (filter or {}).items():
            # Metadata is jsonb, so filters address nested keys with ->>.
            query = query.eq(f"metadata->>{key}", str(value))

        query = query.order("checkpoint_id", desc=True)
        if limit:
            query = query.limit(limit)

        for row in query.execute().data or []:
            pending = self._pending_writes(
                row["thread_id"], row["checkpoint_ns"], row["checkpoint_id"]
            )
            yield self._row_to_tuple(row, pending)

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        values = config.get("configurable") or {}
        thread_id = values["thread_id"]
        ns = values.get("checkpoint_ns", "")
        type_tag, blob = _encode(checkpoint, self.serde)

        db().table(CHECKPOINTS).upsert(
            {
                "thread_id": thread_id,
                "checkpoint_ns": ns,
                "checkpoint_id": checkpoint["id"],
                # The step this one follows. Present on every checkpoint after
                # the first, and what makes the thread a chain rather than a set.
                "parent_checkpoint_id": values.get("checkpoint_id"),
                "type": type_tag,
                "checkpoint": blob,
                "metadata": dict(metadata),
            },
            on_conflict="thread_id,checkpoint_ns,checkpoint_id",
        ).execute()

        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": ns,
                "checkpoint_id": checkpoint["id"],
            }
        }

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        if not writes:
            return
        values = config.get("configurable") or {}

        rows = []
        for idx, (channel, value) in enumerate(writes):
            type_tag, blob = _encode(value, self.serde)
            rows.append(
                {
                    "thread_id": values["thread_id"],
                    "checkpoint_ns": values.get("checkpoint_ns", ""),
                    "checkpoint_id": values["checkpoint_id"],
                    "task_id": task_id,
                    "idx": idx,
                    "channel": channel,
                    "type": type_tag,
                    "value": blob,
                }
            )

        # Upsert, not insert: a task that retries writes the same (task_id, idx)
        # again, and that must overwrite rather than collide on the key.
        db().table(WRITES).upsert(
            rows, on_conflict="thread_id,checkpoint_ns,checkpoint_id,task_id,idx"
        ).execute()

    async def adelete_thread(self, thread_id: str) -> None:
        """Drop a whole conversation.

        Writes first: orphaned write rows are invisible to every query but
        would accumulate forever, and there is no foreign key to cascade.
        """
        db().table(WRITES).delete().eq("thread_id", thread_id).execute()
        db().table(CHECKPOINTS).delete().eq("thread_id", thread_id).execute()
