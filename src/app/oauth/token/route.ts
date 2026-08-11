import {
  consumeAuthCode,
  isAllowedRedirectUri,
  isKnownClient,
  isValidClientSecret,
  issueTokens,
  mcpResourceUrl,
  refreshTokens,
  verifyPkce,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

// OAuth 2.1 error responses are a fixed shape with their own status codes;
// `invalid_client` in particular is a 401 rather than a 400.
function oauthError(error: string, description?: string, status = 400) {
  return Response.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { ...CORS, "cache-control": "no-store" } },
  );
}

// Client credentials arrive either as form fields (client_secret_post) or HTTP
// Basic (client_secret_basic). Both are advertised in the metadata, so both
// have to be read here.
function readClientCredentials(request: Request, form: URLSearchParams) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator !== -1) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    }
  }
  return {
    clientId: form.get("client_id") ?? "",
    clientSecret: form.get("client_secret") ?? "",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "body must be form-encoded");
  }

  const { clientId, clientSecret } = readClientCredentials(request, form);
  if (!isKnownClient(clientId) || !isValidClientSecret(clientSecret)) {
    return oauthError("invalid_client", "client authentication failed", 401);
  }

  const grantType = form.get("grant_type");

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token");
    if (!presented) return oauthError("invalid_request", "refresh_token is required");

    const rotated = await refreshTokens(presented);
    if (!rotated) return oauthError("invalid_grant", "refresh token is invalid or expired");

    return Response.json(
      {
        access_token: rotated.accessToken,
        refresh_token: rotated.refreshToken,
        token_type: "Bearer",
        expires_in: rotated.expiresIn,
      },
      { headers: { ...CORS, "cache-control": "no-store" } },
    );
  }

  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", `unsupported grant_type: ${grantType ?? "none"}`);
  }

  const code = form.get("code");
  const verifier = form.get("code_verifier");
  const redirectUri = form.get("redirect_uri");

  if (!code) return oauthError("invalid_request", "code is required");
  if (!verifier) return oauthError("invalid_request", "code_verifier is required");

  const stored = await consumeAuthCode(code);
  if (!stored) return oauthError("invalid_grant", "code is invalid, expired, or already used");

  // The redirect_uri presented here must match the one the code was issued
  // against, not merely be on the allow-list.
  if (!isAllowedRedirectUri(redirectUri) || redirectUri !== stored.redirect_uri) {
    return oauthError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (stored.client_id !== clientId) {
    return oauthError("invalid_grant", "code was issued to a different client");
  }
  if (!verifyPkce(verifier, stored.code_challenge)) {
    return oauthError("invalid_grant", "PKCE verification failed");
  }

  // RFC 8707: the token is bound to the resource it was requested for, and
  // /api/mcp later refuses any token whose audience is not itself.
  const requestedResource = form.get("resource") ?? stored.resource;
  if (requestedResource && requestedResource !== mcpResourceUrl()) {
    return oauthError("invalid_target", "resource is not served by this authorization server");
  }

  const tokens = await issueTokens({
    userId: stored.user_id,
    clientId: stored.client_id,
    scope: stored.scope,
    audience: mcpResourceUrl(),
  });

  return Response.json(
    {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      scope: stored.scope,
    },
    { headers: { ...CORS, "cache-control": "no-store" } },
  );
}
