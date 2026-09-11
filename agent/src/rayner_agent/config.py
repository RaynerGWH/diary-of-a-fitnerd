"""Runtime configuration, read once at import.

Nothing here is required to boot. A Lambda that can't answer /health because an
unrelated secret is missing is a Lambda you can't diagnose, so every secret is
optional at load and asserted at the point of use via `require`.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"

    # Shared secret for the JWT minted by the Next app. The user id is taken
    # from that token and never from a request body, because the Supabase key
    # below bypasses RLS entirely.
    agent_shared_secret: str | None = None
    jwt_audience: str = "rayner-agent"

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # Provider-agnostic on purpose: OpenAI, OpenRouter, and most gateways all
    # speak the same API, so swapping is two env vars rather than a code change.
    # Leave llm_base_url unset for OpenAI direct.
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str = "gpt-5.4-mini"

    # Accepted so an existing OpenRouter setup keeps working without edits.
    openrouter_api_key: str | None = None
    openai_api_key: str | None = None

    @property
    def api_key(self) -> str | None:
        return self.llm_api_key or self.openai_api_key or self.openrouter_api_key

    @property
    def base_url(self) -> str | None:
        if self.llm_base_url:
            return self.llm_base_url
        # Only fall back to OpenRouter when that is the key actually in use.
        if not (self.llm_api_key or self.openai_api_key) and self.openrouter_api_key:
            return "https://openrouter.ai/api/v1"
        return None


@lru_cache
def settings() -> Settings:
    return Settings()


def require[T](value: T | None, name: str) -> T:
    if value is None:
        raise RuntimeError(f"{name} is not configured")
    return value
