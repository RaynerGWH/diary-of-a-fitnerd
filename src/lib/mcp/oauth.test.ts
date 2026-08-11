import { describe, expect, it } from "vitest";
import { verifyPkce } from "./oauth";

describe("verifyPkce", () => {
  // The worked example from RFC 7636 Appendix B. If this ever fails, the S256
  // implementation has drifted and every client's token exchange breaks.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("accepts the verifier that produced the challenge", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects a different verifier", () => {
    expect(verifyPkce("some-other-verifier", challenge)).toBe(false);
  });

  it("rejects a verifier that differs by one character", () => {
    expect(verifyPkce(verifier.slice(0, -1) + "X", challenge)).toBe(false);
  });

  it("rejects an empty verifier", () => {
    expect(verifyPkce("", challenge)).toBe(false);
  });

  // A challenge of the wrong length is compared by length first, because
  // timingSafeEqual throws rather than returning false on a size mismatch.
  it("rejects a malformed challenge without throwing", () => {
    expect(verifyPkce(verifier, "too-short")).toBe(false);
    expect(verifyPkce(verifier, "")).toBe(false);
  });
});
