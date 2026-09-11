"""HTTP surface for the agent service.

Two endpoints per agent: one to start a turn, one to resume a paused one.
Routing between agents is static, so `/agents/capture/invoke` goes straight to
the capture agent with no supervisor model call deciding which to use.

The user id never appears in a request body. It comes from the bearer token,
verified in auth.py, and is passed into the graph through config where no tool
schema can reach it.
"""

import uuid
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel, Field

from rayner_agent.agents.capture.graph import capture_graph
from rayner_agent.auth import current_user
from rayner_agent.config import settings
from rayner_agent.db.checkpointer import thread_key

app = FastAPI(title="rayner-agent", version="0.1.0")

AGENTS = {"capture": capture_graph}

# Matches MAX_MESSAGE_LENGTH in the Next app. Nothing typed by hand comes near
# it; it exists to bound what a single request can cost, since the message is
# forwarded to a paid model call.
MAX_MESSAGE_LENGTH = 2000

UserId = Annotated[str, Depends(current_user)]


class Health(BaseModel):
    status: str
    env: str
    agents: list[str]


class InvokeRequest(BaseModel):
    message: str = Field(max_length=MAX_MESSAGE_LENGTH)
    thread_id: str
    memories: str | None = None


class ResumeRequest(BaseModel):
    thread_id: str
    approved: bool


class TurnResponse(BaseModel):
    reply: str
    thread_id: str
    # Present when the turn paused for confirmation. The client shows a card
    # and posts back to /resume; until it does, nothing has been written.
    pending: dict[str, Any] | None = None


@app.get("/health", response_model=Health)
async def health() -> Health:
    # Deliberately touches nothing. This answers "is the container alive",
    # which is also what a cold-start ping hits; dependency checks belong in
    # their own endpoint rather than on the warm path.
    return Health(status="ok", env=settings().env, agents=sorted(AGENTS))


def _graph(agent: str):
    if agent not in AGENTS:
        raise HTTPException(status_code=404, detail=f"unknown agent: {agent}")
    return AGENTS[agent]()


def _pending(result: dict[str, Any]) -> dict[str, Any] | None:
    """The payload from an `interrupt()`, if the turn paused."""
    interrupts = result.get("__interrupt__")
    return dict(interrupts[0].value) if interrupts else None


@app.post("/agents/{agent}/invoke", response_model=TurnResponse)
async def invoke(agent: str, body: InvokeRequest, user_id: UserId) -> TurnResponse:
    graph = _graph(agent)
    # Namespaced by user: the checkpoint tables key on thread_id alone, so a
    # guessed id would otherwise read someone else's conversation.
    thread = thread_key(user_id, body.thread_id)

    result = await graph.ainvoke(
        {"messages": [HumanMessage(body.message)]},
        config={
            "configurable": {
                "user_id": user_id,
                "thread_id": thread,
                "memories": body.memories,
            }
        },
    )
    pending = _pending(result)
    return TurnResponse(
        # A paused turn has produced no reply yet: the confirmation card is
        # what the user sees, and the reply comes after they answer.
        reply=result.get("reply") or "",
        thread_id=body.thread_id,
        pending=pending,
    )


@app.post("/agents/{agent}/resume", response_model=TurnResponse)
async def resume(agent: str, body: ResumeRequest, user_id: UserId) -> TurnResponse:
    graph = _graph(agent)
    thread = thread_key(user_id, body.thread_id)

    result = await graph.ainvoke(
        Command(resume={"approved": body.approved}),
        config={"configurable": {"user_id": user_id, "thread_id": thread}},
    )
    return TurnResponse(
        reply=result.get("reply") or "done",
        thread_id=body.thread_id,
        pending=_pending(result),
    )


@app.post("/threads")
async def new_thread(user_id: UserId) -> dict[str, str]:
    """Mint a thread id.

    Here rather than in the Next app so both sides agree on the format, and so
    a client can never hand over something that collides with an existing
    conversation.
    """
    return {"thread_id": str(uuid.uuid4())}
