import { protectedResourceMetadata, METADATA_HEADERS } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

// RFC 9728 locates a resource's metadata by inserting the well-known segment
// between the host and the resource's own path, so the MCP endpoint at
// /api/mcp is described at /.well-known/oauth-protected-resource/api/mcp.
// Clients differ on whether they use that form or the bare one, so both are
// served and both describe the same single resource.
export async function GET() {
  return Response.json(protectedResourceMetadata(), { headers: METADATA_HEADERS });
}
