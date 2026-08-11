import { protectedResourceMetadata, METADATA_HEADERS } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(protectedResourceMetadata(), { headers: METADATA_HEADERS });
}
