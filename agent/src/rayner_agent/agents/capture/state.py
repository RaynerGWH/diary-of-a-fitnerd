"""What flows through the graph.

Nodes never mutate this. They return a partial dict and LangGraph merges it,
which is why `messages` carries the `add_messages` reducer: without it, a node
returning `{"messages": [ai_msg]}` would *replace* the history instead of
appending to it.

Everything per-request and immutable (user_id, thread_id) lives in `config`
instead, not here. The rule is: state is what changes during a turn, config is
what was decided before it started.
"""

from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class CaptureState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

    # The user-facing text, normalised from whichever shape the turn produced:
    # a `reply` argument, `add_entries`'s own confirmation, or plain content.
    # The UI reads one field, so the graph resolves the three into one here
    # rather than making every caller work it out.
    reply: str | None

    # How many times the model has been asked. Bounds the tool loop: without
    # it a model that keeps searching burns calls until the recursion limit
    # kills the run with no reply at all.
    rounds: int
