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
from rayner_agent.db.checkpointer import SupabaseCheckpointSaver
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


def start_turn(state: CaptureState) -> dict[str, Any]:
    """Reset the per-turn counters.

    `messages` carries a reducer and accumulates across turns, which is the
    point. `rounds` and `reply` must not: once a checkpointer is attached,
    state survives between turns, so a carried-over `rounds` would start turn
    two at the cap and answer a fresh message with "couldn't find an entry",
    and a carried-over `reply` would show the previous turn's text if this one
    failed to produce its own.

    A node rather than something the caller passes in, so it cannot be
    forgotten at a call site.
    """
    return {"rounds": 0, "reply": None}


def give_up(state: CaptureState) -> dict[str, Any]:
    """Stop looping and answer with a fixed line.

    Reached when the model has searched MAX_ROUNDS times without settling on
    anything. Answering beats letting the recursion limit raise, which loses
    the turn entirely.

    No model call: the turn has already spent four rounds failing, and paying
    a fifth to phrase an apology is not worth it.
    """
    return {"messages": [AIMessage(content=GAVE_UP)], "reply": GAVE_UP}


async def call_model(state: CaptureState, config: RunnableConfig) -> dict[str, Any]:
    # Rebuilt every turn because it carries the current Singapore time. Kept
    # out of state so it is never checkpointed and never goes stale on resume.
    memories = (config.get("configurable") or {}).get("memories")
    prompt = SystemMessage(content=system_prompt(now_sgt(), memories))

    response = await _llm().ainvoke([prompt, *state["messages"]], config)
    return {"messages": [response], "rounds": state.get("rounds", 0) + 1}


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


def after_tools(state: CaptureState) -> Literal["model", "give_up", "finalise"]:
    """Finish, loop, or bail.

    The cap lives on this edge rather than inside call_model because this is
    the only edge that loops. Checking it anywhere earlier would test a
    counter that start_turn has just reset to zero.
    """
    ai_msg = next((m for m in reversed(state["messages"]) if isinstance(m, AIMessage)), None)
    if ai_msg is not None and is_terminal(ai_msg):
        return "finalise"
    if state.get("rounds", 0) >= MAX_ROUNDS:
        return "give_up"
    return "model"


def build_graph(checkpointer: Any | None = None):
    builder = StateGraph(CaptureState)

    builder.add_node("start", start_turn)
    builder.add_node("model", call_model)
    builder.add_node("tools", ToolNode(CAPTURE_TOOLS))
    builder.add_node("give_up", give_up)
    builder.add_node("finalise", finalise)

    builder.set_entry_point("start")
    builder.add_edge("start", "model")

    # A terminal tool still has to *run* before the turn ends: add_entries has
    # to actually insert. So terminal turns go through the tool node too, and
    # only the no-tool-call case leaves directly from the model.
    builder.add_conditional_edges(
        "model", after_model, {"tools": "tools", "finalise": "finalise"}
    )
    builder.add_conditional_edges(
        "tools", after_tools,
        {"model": "model", "give_up": "give_up", "finalise": "finalise"},
    )
    builder.add_edge("give_up", "finalise")
    builder.add_edge("finalise", END)

    return builder.compile(checkpointer=checkpointer)


@lru_cache
def capture_graph():
    """The compiled agent, built once per execution environment.

    The checkpointer is what gives the conversation a memory: state is saved
    after every step against the thread id, so the next request resumes rather
    than starting blank. Without it "actually make that $500" arrives with no
    idea what "that" refers to.
    """
    return build_graph(SupabaseCheckpointSaver())
