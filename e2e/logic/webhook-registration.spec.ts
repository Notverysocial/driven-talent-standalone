import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WEBHOOK_PATHS, isWebhookPath, webhookPathFor } from "../../src/lib/webhook-paths";
import { requireWebhookSecret } from "../../src/lib/integrations/webhook-auth";

// The regression gate for the INBOUND half of the 2026-07 proxy outage.
//
// PR #68 fixed the outbound half: Vercel Cron requests carry no session, so any
// path missing from the proxy's public allowlist is 307-redirected to /login
// BEFORE the route handler runs — no log line, no write, no trace. That fix
// added CRON_PATHS plus a CI diff so a new cron cannot silently go dark.
//
// It never covered webhooks. An inbound provider callback carries no session
// either, so /api/integrations/webhook/<provider> had exactly the same problem
// and nobody noticed, because the symptom is indistinguishable from "the
// provider isn't sending anything". Measured against production 2026-07-22:
//
//   /api/integrations/webhook/calendly → 307 → /login   (not allowlisted)
//   /api/integrations/cron             → 401            (allowlisted, own secret)
//   /api/intake/application            → 204            (allowlisted)
//
// The route's own header calls itself a "Public endpoint" whose provider client
// "is responsible for verifying the signature header". It was never public.
// Five providers implement handleWebhook; all five were unreachable.
//
// This spec diffs the provider files against the allowlist, so adding a
// provider webhook without registering its path fails CI instead of failing
// silently in production.

const PROVIDER_DIR = join(process.cwd(), "src/lib/integrations/providers");

/** Providers that actually implement an inbound webhook handler — read from
 *  the source rather than the registry, because importing the registry pulls
 *  server-only modules into this pure gate. */
const providersWithWebhooks = readdirSync(PROVIDER_DIR)
  .filter((f) => f.endsWith(".ts"))
  .filter((f) =>
    /^\s*async handleWebhook\s*\(/m.test(readFileSync(join(PROVIDER_DIR, f), "utf8")),
  )
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

test.describe("every provider webhook is reachable through the proxy", () => {
  test("the provider scan actually found handlers (guards an empty diff passing)", () => {
    // If this ever drops to zero the diff below becomes vacuously true and the
    // whole gate silently stops protecting anything.
    expect(providersWithWebhooks.length).toBeGreaterThan(0);
    expect(providersWithWebhooks).toEqual([
      "calendly",
      "indeed",
      "pandadoc",
      "ringcentral",
      "uattend",
    ]);
  });

  test("THE OUTAGE: every provider with a webhook handler is allowlisted", () => {
    const unregistered = providersWithWebhooks
      .map(webhookPathFor)
      .filter((p) => !isWebhookPath(p));
    expect(
      unregistered,
      `These webhook paths are NOT allowlisted in src/lib/webhook-paths.ts, so ` +
        `the proxy will 307 them to /login and the provider's callbacks will ` +
        `never arrive:\n` + unregistered.map((p) => `  - ${p}`).join("\n"),
    ).toEqual([]);
  });

  test("/api/integrations/webhook/calendly specifically — the path that was dark", () => {
    expect(isWebhookPath("/api/integrations/webhook/calendly")).toBe(true);
  });

  test("the allowlist has no entries without a matching handler", () => {
    // Drift the other way: an allowlisted path with no handler is an endpoint
    // exposed past the auth gate for no reason.
    const handled = new Set(providersWithWebhooks.map(webhookPathFor));
    const orphans = WEBHOOK_PATHS.filter((p) => !handled.has(p));
    expect(
      orphans,
      `Allowlisted but no provider implements handleWebhook: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  test("matching is exact — no prefix wildcard past the auth gate", () => {
    // A prefix match would open everything under the segment, including
    // traversal-shaped paths. Only the enumerated provider paths are public.
    for (const p of [
      "/api/integrations/webhook",
      "/api/integrations/webhook/",
      "/api/integrations/webhook/calendly/extra",
      "/api/integrations/webhook/calendly/../../sync/uattend",
      "/api/integrations/webhook/nope",
      "/api/integrations/webhook/CALENDLY",
    ]) {
      expect(isWebhookPath(p), p).toBe(false);
    }
  });

  test("unrelated paths are not allowlisted by this list", () => {
    for (const p of ["/dashboard", "/api/integrations/sync/uattend", "/clients", "/"]) {
      expect(isWebhookPath(p), p).toBe(false);
    }
  });

  test("prismhr has no webhook handler, so it gets no public path", () => {
    // It is a real provider in ALL_PROVIDERS but scaffold-only. Allowlisting
    // every provider by default would expose a path with nothing behind it.
    expect(providersWithWebhooks).not.toContain("prismhr");
    expect(isWebhookPath("/api/integrations/webhook/prismhr")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FAIL-CLOSED SECRET — the exact hazard PR #68 hit on the cron side.
//
// Allowlisting is what makes the webhooks arrive, and it removes the accidental
// protection the 307 was providing. Every provider verified like this:
//
//     const secret = integration?.webhook_secret ?? null;
//     if (secret) { ...verify HMAC... }
//
// which does NOTHING when the secret is unset. indeed.ts said so out loud:
// "If we have no secret stored, skip verification (dev / pre-go-live)". Public
// + unset = an unauthenticated write endpoint that creates candidates, punches
// and time cards. So the allowlist and this gate ship together, never apart.
// ---------------------------------------------------------------------------

test.describe("requireWebhookSecret — no secret means refuse, never accept", () => {
  test("null secret refuses (it must NOT process unauthenticated)", () => {
    const v = requireWebhookSecret(null);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.error).toBe("webhook_secret_unset");
  });

  test("undefined secret refuses", () => {
    expect(requireWebhookSecret(undefined).ok).toBe(false);
  });

  test("empty / whitespace secret also refuses", () => {
    expect(requireWebhookSecret("").ok).toBe(false);
    expect(requireWebhookSecret("   ").ok).toBe(false);
    expect(requireWebhookSecret("\t\n").ok).toBe(false);
  });

  test("a real secret is accepted and handed back for verification", () => {
    const v = requireWebhookSecret("s1gn1ng-key");
    expect(v.ok).toBe(true);
    expect(v.ok === true && v.secret).toBe("s1gn1ng-key");
  });

  test("the secret is returned verbatim — not trimmed into a different key", () => {
    // Trimming would silently change the HMAC input and every signature would
    // fail with a misleading "invalid_signature" instead of a config error.
    const v = requireWebhookSecret(" padded ");
    expect(v.ok === true && v.secret).toBe(" padded ");
  });
});

test.describe("every provider's handleWebhook actually calls the gate", () => {
  // Source-level assertion. A provider that forgets the gate is fail-open, and
  // that is invisible in any test that only exercises the providers that
  // remembered it.
  for (const provider of providersWithWebhooks) {
    test(`${provider} refuses when webhook_secret is unset`, () => {
      const src = readFileSync(join(PROVIDER_DIR, `${provider}.ts`), "utf8");
      expect(
        src.includes("requireWebhookSecret"),
        `${provider}.ts implements handleWebhook but never calls ` +
          `requireWebhookSecret — with the path now allowlisted, an unset ` +
          `webhook_secret makes it an open write endpoint.`,
      ).toBe(true);
      expect(
        /if\s*\(\s*secret\s*\)\s*\{/.test(src),
        `${provider}.ts still has the fail-open 'if (secret) {' guard.`,
      ).toBe(false);
    });
  }
});
