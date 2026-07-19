import { test, expect } from "@playwright/test";
import { describeError, isDnsFailure } from "../../src/lib/integrations/describe-error";

// The uAttend integration recorded `last_error = "fetch failed"` on 2026-07-19.
// That is undici's generic message for any network-layer failure and names
// neither the host nor the reason. The actual diagnosis — `getaddrinfo
// ENOTFOUND api.uattend.com` — was in `err.cause`, which every provider threw
// away with `e instanceof Error ? e.message : "..."`.
//
// Diagnosing it cost a manual DNS lookup. These tests exist so the next opaque
// failure costs thirty seconds instead.

// Node/undici shape: a TypeError whose `cause` carries the real error.
function fetchFailure(cause: Partial<{
  message: string;
  code: string;
  errno: number;
  syscall: string;
  hostname: string;
}>): Error {
  const err = new TypeError("fetch failed");
  (err as Error & { cause?: unknown }).cause = Object.assign(
    new Error(cause.message ?? "network error"),
    cause,
  );
  return err;
}

test.describe("describeError — the cause is the diagnosis", () => {
  test("THE INCIDENT: a dead hostname names itself", () => {
    const err = fetchFailure({
      message: "getaddrinfo ENOTFOUND api.uattend.com",
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "api.uattend.com",
    });
    const out = describeError(err, "uattend_fetch_failed");

    // Everything an operator needs, in the string that lands in last_error.
    expect(out).toContain("fetch failed");
    expect(out).toContain("ENOTFOUND");
    expect(out).toContain("api.uattend.com");
    // And it is no longer JUST the useless part.
    expect(out).not.toBe("fetch failed");
  });

  test("connection refused is distinguishable from DNS", () => {
    const out = describeError(
      fetchFailure({
        message: "connect ECONNREFUSED 10.0.0.1:443",
        code: "ECONNREFUSED",
        syscall: "connect",
      }),
      "x",
    );
    expect(out).toContain("ECONNREFUSED");
    expect(out).toContain("10.0.0.1:443");
  });

  test("a TLS failure is distinguishable too", () => {
    const out = describeError(
      fetchFailure({
        message: "certificate has expired",
        code: "CERT_HAS_EXPIRED",
      }),
      "x",
    );
    expect(out).toContain("CERT_HAS_EXPIRED");
    expect(out).toContain("certificate has expired");
  });

  test("a timeout is distinguishable too", () => {
    const out = describeError(
      fetchFailure({
        message: "Connect Timeout Error",
        code: "UND_ERR_CONNECT_TIMEOUT",
      }),
      "x",
    );
    expect(out).toContain("UND_ERR_CONNECT_TIMEOUT");
  });

  test("the hostname is not repeated when the cause message already has it", () => {
    const out = describeError(
      fetchFailure({
        message: "getaddrinfo ENOTFOUND api.uattend.com",
        code: "ENOTFOUND",
        hostname: "api.uattend.com",
      }),
      "x",
    );
    expect(out.match(/api\.uattend\.com/g)).toHaveLength(1);
  });

  test("the hostname IS added when the cause message omits it", () => {
    const out = describeError(
      fetchFailure({ message: "network error", code: "ENOTFOUND", hostname: "api.example.com" }),
      "x",
    );
    expect(out).toContain("host=api.example.com");
  });

  test("an ordinary Error with no cause is passed through unchanged", () => {
    // Provider errors like `uAttend 401 /reports/punch: ...` are already
    // informative. Do not decorate them.
    const msg = "uAttend 401 /reports/punch: invalid api key";
    expect(describeError(new Error(msg), "x")).toBe(msg);
  });

  test("a non-Error throw says so instead of posing as a network failure", () => {
    expect(describeError("boom", "provider_threw")).toContain("provider_threw");
    expect(describeError("boom", "provider_threw")).toContain("boom");
    expect(describeError(undefined, "provider_threw")).toContain("undefined");
    expect(describeError({ weird: true }, "provider_threw")).toContain("weird");
  });

  test("never returns an empty or useless string", () => {
    for (const input of [new Error(""), "", null, undefined, 0, fetchFailure({})]) {
      const out = describeError(input, "fallback_label");
      expect(out.length, `input=${String(input)}`).toBeGreaterThan(0);
    }
  });
});

test.describe("isDnsFailure — 'the URL is wrong', not 'the credential is wrong'", () => {
  test("ENOTFOUND and EAI_AGAIN are DNS", () => {
    expect(isDnsFailure(fetchFailure({ code: "ENOTFOUND" }))).toBe(true);
    expect(isDnsFailure(fetchFailure({ code: "EAI_AGAIN" }))).toBe(true);
  });

  test("refused / TLS / timeout are NOT DNS", () => {
    // Matters operationally: a DNS failure means no credential was ever sent,
    // so there is nothing to rotate.
    expect(isDnsFailure(fetchFailure({ code: "ECONNREFUSED" }))).toBe(false);
    expect(isDnsFailure(fetchFailure({ code: "CERT_HAS_EXPIRED" }))).toBe(false);
    expect(isDnsFailure(fetchFailure({ code: "UND_ERR_CONNECT_TIMEOUT" }))).toBe(false);
  });

  test("a plain Error is not DNS", () => {
    expect(isDnsFailure(new Error("fetch failed"))).toBe(false);
    expect(isDnsFailure("nope")).toBe(false);
  });
});
