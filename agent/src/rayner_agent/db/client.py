"""The Supabase client, built once per execution environment.

Module scope on purpose: Lambda reuses a warm container across invocations, so
building this at import time means only a cold start pays for it.

This holds the **service_role** key, which bypasses row level security
completely. Nothing here is protected by the database. Every function in this
package therefore takes an explicit `user_id` and filters on it, and that id
must come from the verified JWT rather than from a request body or a tool
argument. That one rule is the whole authorization model.
"""

from functools import lru_cache

from supabase import Client, create_client

from rayner_agent.config import require, settings


@lru_cache
def db() -> Client:
    s = settings()
    return create_client(
        require(s.supabase_url, "SUPABASE_URL"),
        require(s.supabase_service_role_key, "SUPABASE_SERVICE_ROLE_KEY"),
    )
