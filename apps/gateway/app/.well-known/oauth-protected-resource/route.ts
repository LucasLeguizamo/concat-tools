import { json, mcpResource, preflight, publicUrl } from "../../../lib/auth/http";

export const dynamic = "force-dynamic";

/** RFC 9728: el recurso es /mcp y su Authorization Server es el propio gateway. */
export function GET() {
  return json(
    {
      resource: mcpResource(),
      authorization_servers: [publicUrl()],
      bearer_methods_supported: ["header"],
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
