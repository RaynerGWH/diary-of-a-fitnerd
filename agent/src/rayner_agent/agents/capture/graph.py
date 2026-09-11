"""The Capture agent.

Two nodes and one conditional edge:

    model ──(terminal tool? )──> END
      ↑
      └────── tools <──(anything else)

The whole design rests on `is_terminal` in routing.py. A tool that finishes the
turn routes to END; anything else loops so the model can read the tool result
and continue. That is what makes a mixed message work: `add_entries` alongside
a search saves the first half, loops, and carries on with the second.

The model is bound to the tools with `.bind_tools()`, which is what turns the
pydantic signatures into the JSON schema the provider receives.
"""

from functools import lru_cache
from typing import Any, Literal

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from rayner_agent.agents.capture.prompts import system_prompt
from rayner_agent.agents.capture.routing import is_terminal, reply_text
from rayner_agent.agents.capture.state import CaptureState
from rayner_agent.config import require, settings
from rayner_agent.domain.timezone import now_sgt
from rayner_agent.tools.entries import CAPTURE_TOOLS

# The model is asked at most this many times per turn. The search loop is the
# thing that can run away: two rounds of searching is generous, and the prompt
# tells it to give up after that.
MAX_ROUNDS = 4

# What the user sees when the loop is cut short. Templated rather than another
# model call: the turn has already spent four rounds failing, and the pending
# card carries the actual affordance anyway.
GAVE_UP = "couldn't find an entry to edit, want me to log this as new instead?"


@lru_cache
def _llm():
    """Built once per execution environment, reused across warm invocations."""
    s = settings()
    return ChatOpenAI(
        model=s.llm_model,
        api_key=require(s.api_key, "LLM_API_KEY"),
        base_url=s.base_url,
        temperature=0,
        timeout=45,
    ).bind_tools(CAPTURE_TOOLS)


async def call_model(state: CaptureState, config: RunnableConfig) -> dict[str, Any]:
    rounds = state.get("rounds", 0)
    if rounds >= MAX_ROUNDS:
        # Return a plain message with no tool calls: is_terminal reads that as
        # done, so the loop closes here rather than at the recursion limit,
        # which would raise instead of replying.
        return {"messages": [AIMessage(content=GAVE_UP)], "reply": GAVE_UP, "rounds": rounds + 1}

    # Rebuilt every turn because it carries the current Singapore time. Kept
    # out of state so it is never checkpointed and never goes stale on resume.
    memories = (config.get("configurable") or {}).get("memories")
    prompt = SystemMessage(content=system_prompt(now_sgt(), memories))

    response = await _llm().ainvoke([prompt, *state["messages"]], config)
    return {"messages": [response], "rounds": rounds + 1}


def after_model(state: CaptureState) -> Literal["tools", "finalise"]:
    """Any tool call goes to the tool node, terminal or not.

    Terminality decides whether to come *back* to the model, not whether the
    tool runs. Routing a terminal `add_entries` straight to the end would skip
    the insert and reply "logged it" having saved nothing.
    """
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "finalise"


async def finalise(state: CaptureState) -> dict[str, Any]:
    """Pull the reply out of whichever shape the turn produced.

    Runs after the tool node on a terminal turn, because `add_entries` builds
    its confirmation from the rows that actually landed, and that text only
    exists once the tool has run.
    """
    ai_msg = next(
        (m for m in reversed(state["messages"]) if isinstance(m, AIMessage)),
        None,
    )
    if ai_msg is None:
        return {"reply": "done"}

    results = {
        m.tool_call_id: str(m.content)
        for m in state["messages"]
        if isinstance(m, ToolMessage)
    }
    return {"reply": reply_text(ai_msg, results)}


def after_tools(state: CaptureState) -> Literal["model", "finalise"]:
    """A terminal tool has now run, so finish. Otherwise back to the model."""
    ai_msg = next((m for m in reversed(state["messages"]) if isinstance(m, AIMessage)), None)
    if ai_msg is not None and is_terminal(ai_msg):
        return "finalise"
    return "model"


def build_graph(checkpointer: Any | None = None):
    builder = StateGraph(CaptureState)

    builder.add_node("model", call_model)
    builder.add_node("tools", ToolNode(CAPTURE_TOOLS))
    builder.add_node("finalise", finalise)

    builder.set_entry_point("model")

    # A terminal tool still has to *run* before the turn ends: add_entries has
    # to actually insert. So terminal turns go through the tool node too, and
    # only the no-tool-call case leaves directly from the model.
    builder.add_conditional_edges(
        "model", after_model, {"tools": "tools", "finalise": "finalise"}
    )
    builder.add_conditional_edges("tools", after_tools, {"model": "model", "finalise": "finalise"})
    builder.add_edge("finalise", END)

    return builder.compile(checkpointer=checkpointer)


@lru_cache
def capture_graph():
    # No checkpointer yet: that decision is still open, and the graph runs
    # start-to-finish without one until edit/delete interrupts land.
    return build_graph()
