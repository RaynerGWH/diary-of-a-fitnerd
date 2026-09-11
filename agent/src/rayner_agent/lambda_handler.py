"""Lambda entrypoint.

Mangum adapts the ASGI app to Lambda's event/context signature. The only thing
here that isn't boilerplate is the flush.
"""

import logging

from mangum import Mangum

from rayner_agent.app import app

log = logging.getLogger(__name__)

# lifespan="off": there are no ASGI startup hooks. Anything expensive (the
# Supabase client, the checkpointer pool) is built at module scope instead, so
# a warm invocation reuses it.
_asgi = Mangum(app, lifespan="off")


def _flush_tracers() -> None:
    """Push pending LangSmith traces before the execution environment freezes.

    Tracing uploads on a background thread. Lambda freezes the instant the
    handler returns, so without this, traces go missing intermittently — and
    the failure reads like "the agent never ran", which is a miserable thing to
    chase. Never let a tracing problem fail a real request.
    """
    try:
        from langchain_core.tracers.langchain import wait_for_all_tracers

        wait_for_all_tracers()
    except Exception:
        log.warning("could not flush tracers", exc_info=True)


def handler(event: dict, context: object) -> dict:
    try:
        return _asgi(event, context)
    finally:
        _flush_tracers()
