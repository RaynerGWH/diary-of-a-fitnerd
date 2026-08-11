import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Lifetimes. The access token is short because the connector re-runs daily and
// refreshes cheaply; the refresh token is long because the whole point is that
// Rayner authorizes the connector once and never thinks about it again.
const AUTH_CODE_TTL_MS = 60_000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// One tool, one permission. Kept as a real scope anyway so a second tool later
// (read-only browsing, say) can be granted separately instead of retrofitting
// scopes onto a connector that never had them.
export const SCOPE_JOBS_WRITE = "jobs:write";
export const SUPPORTED_SCOPES = [SCOPE_JOBS_WRITE];

export type TokenClaims = {
  userId: string;
  clientId: string;
  scope: string;
  audience: string | null;
};

// The public origin of this deployment. Every OAuth metadata document has to
// agree on it byte for byte, and the client compares the issuer with a plain
// string comparison (RFC 9207), so a trailing slash or a stray port breaks the
// flow in a way that is painful to debug. Derived once, here.
export function appOrigin(): string {
  const raw =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  if (!raw) throw new Error("APP_URL must be set");
  return raw.replace(/\/+$/, "");
}

export function mcpResourceUrl(): string {
  return `${appOrigin()}/api/mcp`;
}

// ------------------------------------------------------------
// Client authentication
// ------------------------------------------------------------

export function expectedClientId(): string {
  const id = process.env.MCP_OAUTH_CLIENT_ID;
  if (!id) throw new Error("MCP_OAUTH_CLIENT_ID must be set");
  return id;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Hash first so both sides are always 32 bytes.
  return timingSafeEqual(
    createHash("sha256").update(bufA).digest(),
    createHash("sha256").update(bufB).digest(),
  );
}

export function isKnownClient(clientId: string | null | undefined): boolean {
  if (!clientId) return false;
  return constantTimeEquals(clientId, expectedClientId());
}

export function isValidClientSecret(secret: string | null | undefined): boolean {
  const expected = process.env.MCP_OAUTH_CLIENT_SECRET;
  if (!expected) throw new Error("MCP_OAUTH_CLIENT_SECRET must be set");
  if (!secret) return false;
  return constantTimeEquals(secret, expected);
}

// claude.ai's redirect target. Anthropic hosts the callback, so this is a fixed
// allow-list rather than something the client gets to nominate freely: an open
// redirect_uri on an authorization server hands out authorization codes to
// whoever asks. MCP_OAUTH_REDIRECT_URIS exists so a local mcp-inspector run can
// be allowed temporarily without editing code.
export function allowedRedirectUris(): string[] {
  const extra = (process.env.MCP_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback", ...extra];
}

export function isAllowedRedirectUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return allowedRedirectUris().includes(uri);
}

// ------------------------------------------------------------
// PKCE
// ------------------------------------------------------------

// RFC 7636 S256: BASE64URL(SHA256(ASCII(verifier))) must equal the challenge
// recorded at /authorize. This is what stops a stolen authorization code from
// being redeemed by anyone but the client that started the flow.
export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

// ------------------------------------------------------------
// Authorization codes
// ------------------------------------------------------------

function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAuthCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  resource: string | null;
}): Promise<string> {
  const code = newSecret();
  const db = createServiceClient();
  const { error } = await db.from("oauth_auth_codes").insert({
    code,
    user_id: params.userId,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scope,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    resource: params.resource,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`could not issue authorization code: ${error.message}`);
  return code;
}

type StoredAuthCode = {
  code: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  resource: string | null;
  expires_at: string;
  consumed_at: string | null;
};

// Marks the code consumed before returning it, so two racing redemptions can
// never both succeed: the update is conditional on consumed_at still being
// null, and only the winner gets a row back.
export async function consumeAuthCode(code: string): Promise<StoredAuthCode | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("oauth_auth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code)
    .is("consumed_at", null)
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  const stored = data as StoredAuthCode;
  if (new Date(stored.expires_at).getTime() < Date.now()) return null;
  return stored;
}

// ------------------------------------------------------------
// Access and refresh tokens
// ------------------------------------------------------------

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export async function issueTokens(params: {
  userId: string;
  clientId: string;
  scope: string;
  audience: string | null;
}): Promise<IssuedTokens> {
  const accessToken = newSecret();
  const refreshToken = newSecret();
  const db = createServiceClient();

  const { error } = await db.from("oauth_tokens").insert({
    user_id: params.userId,
    client_id: params.clientId,
    scope: params.scope,
    access_token_hash: hashToken(accessToken),
    refresh_token_hash: hashToken(refreshToken),
    audience: params.audience,
    expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`could not issue tokens: ${error.message}`);

  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) };
}

type StoredToken = {
  id: string;
  user_id: string;
  client_id: string;
  scope: string;
  audience: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

// Rotates on every use: the old refresh token is revoked and a fresh pair
// issued. If a leaked refresh token is used, the legitimate client's next
// refresh fails and the breach surfaces instead of going unnoticed.
export async function refreshTokens(refreshToken: string): Promise<IssuedTokens | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("oauth_tokens")
    .select("*")
    .eq("refresh_token_hash", hashToken(refreshToken))
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;
  const stored = data as StoredToken;

  if (Date.now() - new Date(stored.created_at).getTime() > REFRESH_TOKEN_TTL_MS) return null;

  await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", stored.id);

  return issueTokens({
    userId: stored.user_id,
    clientId: stored.client_id,
    scope: stored.scope,
    audience: stored.audience,
  });
}

// Verifies a bearer token from an MCP request. The audience check is the
// defence against a confused deputy: a token this server minted for itself is
// the only thing it will accept, so a token stolen from some other MCP server
// the user has connected cannot be replayed here.
export async function verifyAccessToken(token: string): Promise<TokenClaims | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("oauth_tokens")
    .select("*")
    .eq("access_token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;
  const stored = data as StoredToken;

  if (new Date(stored.expires_at).getTime() < Date.now()) return null;
  if (stored.audience && stored.audience !== mcpResourceUrl()) return null;

  await db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", stored.id);

  return {
    userId: stored.user_id,
    clientId: stored.client_id,
    scope: stored.scope,
    audience: stored.audience,
  };
}

export function hasScope(claims: TokenClaims, scope: string): boolean {
  return claims.scope.split(/\s+/).filter(Boolean).includes(scope);
}
