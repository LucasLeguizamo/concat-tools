import { json, preflight, publicUrl } from "../../../lib/auth/http";

export const dynamic = "force-dynamic";

/** RFC 8414 + RFC 9207 (iss en la respuesta de authorize) + CIMD. */
export function GET() {
  const base = publicUrl();
  return json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      device_authorization_endpoint: `${base}/oauth/device`,
      revocation_endpoint: `${base}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
