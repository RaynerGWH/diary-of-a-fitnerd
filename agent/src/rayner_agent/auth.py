"""Proving who the caller is.

The Next app holds the Supabase session and knows who is signed in. This
service does not, and it holds a service_role key that bypasses RLS entirely.
So Next mints a short-lived token naming the user, and every request carries
it.

The user id comes from that verified token and never from the request body,
for the same reason the MCP route works this way: the body is attacker-
controlled, the signature is not.

Symmetric HS256 with a shared secret rather than a public-key scheme, because
both halves are ours and deployed together. There is no third party to verify
a signature they cannot also produce.
"""

from datetime import UTC, datetime

import jwt
from fastapi import Header, HTTPException

from rayner_agent.config import require, settings

ALGORITHM = "HS256"

# Tokens are minted per request and travel one hop over TLS. A minute is
# generous for that and short enough that a leaked token is worthless by the
# time anyone finds it.
MAX_LIFETIME_SECONDS = 120


def verify(token: str) -> str:
    """Return the user id a token vouches for, or raise 401."""
    s = settings()
    try:
        claims = jwt.decode(
            token,
            require(s.agent_shared_secret, "AGENT_SHARED_SECRET"),
            algorithms=[ALGORITHM],
            audience=s.jwt_audience,
            # Both are signed by us, so both must be present. A token with no
            # expiry is a permanent credential by accident.
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"invalid token: {e}") from e

    # Defence against a mis-minted token: the library checks that exp has not
    # passed, not that it is soon. A token good for a year would still verify.
    expires = datetime.fromtimestamp(claims["exp"], UTC)
    if (expires - datetime.now(UTC)).total_seconds() > MAX_LIFETIME_SECONDS:
        raise HTTPException(status_code=401, detail="token lifetime is too long")

    return str(claims["sub"])


async def current_user(authorization: str = Header(default="")) -> str:
    """FastAPI dependency: the verified user id, or a 401."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="a bearer token is required")
    return verify(token)


def mint(user_id: str, lifetime_seconds: int = 60) -> str:
    """Produce a token. Used by tests and local tooling, not in production.

    Production tokens are minted by the Next app, which is the only side that
    knows who is signed in.
    """
    s = settings()
    now = int(datetime.now(UTC).timestamp())
    return jwt.encode(
        {"sub": user_id, "aud": s.jwt_audience, "iat": now, "exp": now + lifetime_seconds},
        require(s.agent_shared_secret, "AGENT_SHARED_SECRET"),
        algorithm=ALGORITHM,
    )
