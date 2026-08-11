import { submitJobListings } from "@/lib/mcp/job-listings";
import {
  hasScope,
  appOrigin,
  SCOPE_JOBS_WRITE,
  verifyAccessToken,
  type TokenClaims,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// Protocol versions this server speaks. The client's requested version is
// echoed back when it is one of these, otherwise the newest is offered and the
// client decides whether to continue.
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-session-id, www-authenticate",
};

const TOOLS = [
  {
    name: "submit_job_listings",
    title: "Submit job listings",
    description:
      "Save internship and graduate job listings to Rayner's jobs board. Call this once per run with every listing found, rather than once per listing. Re-submitting a listing that was already saved updates it in place (matched on URL), so it is safe to send the same posting on consecutive days; a listing already marked applied or dismissed keeps that status. Listings without a working http(s) URL are rejected, so include the direct link to the posting rather than a link to the email.",
    inputSchema: {
      type: "object",
      properties: {
        listings: {
          type: "array",
          maxItems: 50,
          description: "The listings found in this run.",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Job title as posted, e.g. 'Software Engineer Intern, Summer 2027'.",
              },
              company: { type: "string", description: "Hiring company." },
              url: {
                type: "string",
                description:
                  "Direct link to the job posting. Used as the dedupe key, so prefer the canonical posting URL over a tracking or newsletter redirect.",
              },
              location: {
                type: "string",
                description: "Location as posted, e.g. 'Singapore' or 'Remote (US)'.",
              },
              summary: {
                type: "string",
                description:
                  "Two or three sentences on the role and what stands out about it. Not the full posting.",
              },
              deadline: {
                type: "string",
                description:
                  "Application deadline as YYYY-MM-DD. Omit entirely if the posting does not state one; do not guess.",
              },
            },
            required: ["title", "url"],
          },
        },
      },
      required: ["listings"],
    },
  },
];

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

function rpcResult(id: string | number | null, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}

function rpcError(id: string | number | null, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: CORS });
}

// A 401 has to point the client at the metadata document that names the
// authorization server, otherwise it has no way to start the OAuth flow.
function unauthorized(description: string) {
  return Response.json(
    { error: "unauthorized", error_description: description },
    {
      status: 401,
      headers: {
        ...CORS,
        "www-authenticate": `Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource", scope="${SCOPE_JOBS_WRITE}"`,
      },
    },
  );
}

async function authenticate(request: Request): Promise<TokenClaims | Response> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return unauthorized("a bearer token is required");
  }
  const claims = await verifyAccessToken(header.slice(7).trim());
  if (!claims) return unauthorized("token is invalid, expired, or revoked");
  return claims;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// This server holds no per-connection state, so there is no SSE stream to open
// and nothing to tear down. Streamable HTTP allows both to be unsupported; a
// 405 is the spec's way of saying so.
export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  return new Response("this server does not offer a server-initiated event stream", {
    status: 405,
    headers: CORS,
  });
}

export async function DELETE(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const claims = auth;

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "parse error: body is not valid JSON");
  }

  const id = body.id ?? null;
  const method = body.method;

  // A JSON-RPC notification carries no id and must get no response body.
  // "notifications/initialized" is the only one Claude sends here.
  if (id === null && typeof method === "string" && method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS });
  }

  switch (method) {
    case "initialize": {
      const requested = (body.params as { protocolVersion?: string } | undefined)?.protocolVersion;
      const version =
        requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : LATEST_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "rayner-os", version: "1.0.0" },
        instructions:
          "Rayner OS jobs board. Use submit_job_listings to save internship and graduate listings found while reading email.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };

      if (params.name !== "submit_job_listings") {
        return rpcError(id, -32602, `unknown tool: ${params.name ?? "(none)"}`);
      }
      if (!hasScope(claims, SCOPE_JOBS_WRITE)) {
        return rpcError(id, -32001, `token is missing the ${SCOPE_JOBS_WRITE} scope`);
      }

      try {
        // userId comes from the verified token, never from the tool arguments:
        // this is the only thing standing between the connector and someone
        // else's rows, since the service_role key bypasses RLS.
        const result = await submitJobListings(claims.userId, params.arguments?.listings);
        const parts = [`Saved ${result.accepted} listing${result.accepted === 1 ? "" : "s"}.`];
        if (result.rejected.length > 0) {
          parts.push(
            `Skipped ${result.rejected.length}:`,
            ...result.rejected.map((r) => `  - ${r.url}: ${r.reason}`),
          );
        }
        return rpcResult(id, {
          content: [{ type: "text", text: parts.join("\n") }],
          structuredContent: result,
        });
      } catch (err) {
        // A tool failure is a result with isError, not a JSON-RPC error: the
        // model should see the message and be able to correct its input.
        return rpcResult(id, {
          content: [
            { type: "text", text: err instanceof Error ? err.message : "could not save listings" },
          ],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `method not found: ${method ?? "(none)"}`);
  }
}
