import { authorizationServerMetadata, METADATA_HEADERS } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

// Some clients probe the path-suffixed form of the authorization server
// metadata URL as well as the bare one. Same document either way.
export async function GET() {
  return Response.json(authorizationServerMetadata(), { headers: METADATA_HEADERS });
}
