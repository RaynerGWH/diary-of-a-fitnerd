import { authorizationServerMetadata, METADATA_HEADERS } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(authorizationServerMetadata(), { headers: METADATA_HEADERS });
}
