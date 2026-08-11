import { appOrigin, mcpResourceUrl, SUPPORTED_SCOPES } from "./oauth";

// RFC 9728. How a client that got a 401 from /api/mcp finds out which
// authorization server to go and talk to. Here the answer is "this same app",
// but the indirection is what the spec requires and what lets the two split
// later without touching the client.
export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [appOrigin()],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

// RFC 8414. Note the absence of a registration_endpoint: this server has one
// pre-registered client, so dynamic client registration is deliberately not
// offered rather than merely unimplemented.
export function authorizationServerMetadata() {
  const origin = appOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // OAuth 2.1 forbids "plain", so S256 is the only method advertised or
    // accepted; see the check constraint on oauth_auth_codes.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    // RFC 9207. The client records this issuer before redirecting and compares
    // it against the `iss` we send back, which is what makes a mix-up attack
    // between two authorization servers detectable.
    authorization_response_iss_parameter_supported: true,
  };
}

export const METADATA_HEADERS = {
  "content-type": "application/json",
  // Discovery documents are fetched by Anthropic's servers, not a browser on
  // this origin, so they have to be readable cross-origin.
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
};
