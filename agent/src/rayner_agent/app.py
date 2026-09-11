"""FastAPI surface for the agent service.

One app, many agents: `/agents/{name}/invoke` routes statically, so the endpoint
already knows which agent runs and no supervisor model call is needed to pick.
Agents land here in phase 4; for now this is the skeleton plus /health.
"""

from fastapi import FastAPI
from pydantic import BaseModel

from rayner_agent.config import settings

app = FastAPI(title="rayner-agent", version="0.1.0")


class Health(BaseModel):
    status: str
    env: str
    agents: list[str]


@app.get("/health", response_model=Health)
async def health() -> Health:
    # Deliberately does not touch Supabase or the model provider. This answers
    # "is the container alive", which is also what the cold-start ping hits;
    # dependency checks belong in their own endpoint, not in the warm path.
    return Health(status="ok", env=settings().env, agents=[])
