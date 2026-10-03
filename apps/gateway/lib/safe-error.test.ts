import { describe, expect, it } from "vitest";
import { redact, toSafeError } from "./safe-error";

const ACCESS = "ya29.a0AfH6SMBx-secret_token.value";
const REFRESH = "1//0gAbCdEfGhIjKlMnOpQrStUv-secret";
const PK = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n";

describe("toSafeError", () => {
  it("error tipo gaxios: no filtra Authorization ni refresh_token del body", () => {
    const err = Object.assign(new Error(`Request failed with status code 401 Bearer ${ACCESS}`), {
      code: 401,
      config: {
        url: "https://oauth2.googleapis.com/token",
        headers: { Authorization: `Bearer ${ACCESS}` },
        data: `grant_type=refresh_token&refresh_token=${REFRESH}&client_secret=GOCSPX-abc`,
        body: JSON.stringify({ refresh_token: REFRESH, private_key: PK }),
      },
      response: {
        status: 401,
        data: {
          error: {
            code: 401,
            message: `Invalid Credentials for ${ACCESS}`,
            status: "UNAUTHENTICATED",
            errors: [{ message: "Invalid Credentials", reason: "authError" }],
          },
        },
        config: { headers: { Authorization: `Bearer ${ACCESS}` } },
        request: { responseURL: "x" },
      },
    });
    const safe = toSafeError(err);
    const dump = JSON.stringify(safe);
    expect(dump).not.toContain("ya29.");
    expect(dump).not.toContain("1//");
    expect(dump).not.toContain("Bearer ya29");
    expect(dump).not.toContain("private_key");
    expect(dump).not.toContain("GOCSPX");
    expect(dump).not.toContain("MIIEvQ");
    expect(safe.status).toBe(401);
    expect(safe.code).toBe("authError");
    expect(Object.keys(safe).sort()).toEqual(["code", "message", "status"]);
  });

  it("OAuth invalid_grant: code desde body.error string", () => {
    const safe = toSafeError({
      response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
    });
    expect(safe).toEqual({ status: 400, code: "invalid_grant", message: "Token has been expired or revoked." });
  });

  it("mensaje que embebe credenciales en texto libre y JSON", () => {
    const safe = toSafeError(
      new Error(`boom {"refresh_token":"${REFRESH}","private_key":"${PK.replace(/\n/g, "\\n")}"} access_token=${ACCESS}`),
    );
    expect(safe.message).not.toMatch(/ya29\.|1\/\/|private_key"\s*:\s*"-----|MIIEvQ/);
  });

  it("entradas raras no explotan", () => {
    expect(toSafeError(null).message).toBe("Error desconocido");
    expect(toSafeError("fallo " + ACCESS).message).not.toContain("ya29.");
    expect(toSafeError({ response: { data: "{not json" } }).message).toBe("Error desconocido");
  });

  it("redact: Bearer y JWT", () => {
    expect(redact("Authorization: Bearer abc.def-ghi")).not.toContain("abc.def");
    expect(redact("t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-nature")).not.toContain("eyJhbGci");
  });
});
