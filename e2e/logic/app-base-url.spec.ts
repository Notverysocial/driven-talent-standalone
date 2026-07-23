import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  LEGACY_PRODUCTION_ORIGIN,
  oauthCallbackUrl,
  resolveAppBaseUrl,
  webhookUrl,
} from "../../src/lib/app-url";
import { webhookPathFor } from "../../src/lib/webhook-paths";

// Where this app lives, resolved once instead of typed out eleven times.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Every provider hardcoded its own absolute callback and webhook URL:
//
//   calendly.ts:64    https://driven-talent-standalone.vercel.app/api/integrations/oauth/calendly/callback
//   calendly.ts:66    https://driven-talent-standalone.vercel.app/api/integrations/webhook/calendly
//   ringcentral.ts:58 ...  pandadoc.ts:48 ...  indeed.ts:35 ...
//
// and two more copies of an `appBaseUrl()` helper existed, VERBATIM identical,
// in inbound-lead-email.server.ts and notifications.server.ts, plus a third
// variant inline in the OAuth callback route. Five providers, four literals,
// three resolvers, one origin.
//
// Moving the app to its own domain therefore does not break one thing loudly —
// it breaks all five integrations quietly and separately, each at whatever
// moment that provider next calls home. The webhook half is worse than the
// OAuth half: an OAuth mismatch fails in the operator's face during Connect,
// while a stale webhook URL just means callbacks stop arriving, which is the
// exact silence we spent PR #79 learning to recognise.
//
// It matters for the reconnect flow specifically. Re-registering a Calendly
// subscription writes the callback URL into the provider's records; doing that
// while WEBHOOK_URL points at the old origin bakes the wrong address in on the
// vendor's side, where we cannot see it.
// ---------------------------------------------------------------------------

const PROVIDER_DIR = join(process.cwd(), "src/lib/integrations/providers");

test.describe("no provider hardcodes the app origin", () => {
  const providerFiles = readdirSync(PROVIDER_DIR).filter((f) => f.endsWith(".ts"));

  test("the scan found the provider files (guards a vacuous pass)", () => {
    expect(providerFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of providerFiles) {
    test(`${f} builds its URLs from the shared base`, () => {
      const src = readFileSync(join(PROVIDER_DIR, f), "utf8");
      // Strip comments — the header comments legitimately quote the old URL to
      // explain the change, and a doc reference is not a hardcoded dependency.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      const offenders = code
        .split("\n")
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => /driven-talent-standalone\.vercel\.app/.test(l));
      expect(
        offenders.map((o) => `line ${o.n}: ${o.l.trim()}`),
        `${f} hardcodes the app origin. A domain switch silently breaks this ` +
          `provider's OAuth callback and/or webhook delivery.`,
      ).toEqual([]);
    });
  }

  test("only ONE module may name the legacy origin", () => {
    // The fallback constant has to live somewhere; it must live in exactly one
    // place, or this grows back.
    const roots = ["src/lib", "src/app"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const code = readFileSync(join(process.cwd(), rel), "utf8")
            .split("\n")
            .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
            .join("\n");
          if (code.includes("driven-talent-standalone.vercel.app")) hits.push(rel);
        }
      }
    };
    roots.forEach(walk);
    expect(hits, `The legacy origin appears in: ${hits.join(", ")}`).toEqual([
      "src/lib/app-url.ts",
    ]);
  });
});

test.describe("resolveAppBaseUrl — precedence", () => {
  test("an explicit site URL wins over everything", () => {
    expect(
      resolveAppBaseUrl(
        {
          NEXT_PUBLIC_SITE_URL: "https://app.driven-talent.com",
          NEXT_PUBLIC_APP_URL: "https://other.example.com",
          VERCEL_PROJECT_PRODUCTION_URL: "vercel-prod.example.com",
        },
        "https://request-origin.example.com",
      ),
    ).toBe("https://app.driven-talent.com");
  });

  test("app URL is used when site URL is absent", () => {
    expect(
      resolveAppBaseUrl({ NEXT_PUBLIC_APP_URL: "https://app.example.com" }, null),
    ).toBe("https://app.example.com");
  });

  test("Vercel's PRODUCTION url is used before the request origin", () => {
    expect(
      resolveAppBaseUrl(
        { VERCEL_PROJECT_PRODUCTION_URL: "dt.vercel.app" },
        "https://preview-abc123.vercel.app",
      ),
    ).toBe("https://dt.vercel.app");
  });

  test("VERCEL_URL is deliberately NOT used — it changes per deploy", () => {
    // A redirect_uri must match what is registered with the provider. Using the
    // per-deploy URL would make every preview deploy fail OAuth, and would put
    // an unreachable address into webhook registrations.
    expect(
      resolveAppBaseUrl({ VERCEL_URL: "dt-git-branch-xyz.vercel.app" }, null),
    ).toBe(LEGACY_PRODUCTION_ORIGIN);
  });

  test("the request origin is the last resort before the legacy constant", () => {
    expect(resolveAppBaseUrl({}, "https://whatever.example.com")).toBe(
      "https://whatever.example.com",
    );
  });

  test("with nothing at all, today's production origin is preserved", () => {
    // The whole change must be a no-op for the current deployment.
    expect(resolveAppBaseUrl({}, null)).toBe(LEGACY_PRODUCTION_ORIGIN);
    expect(LEGACY_PRODUCTION_ORIGIN).toBe(
      "https://driven-talent-standalone.vercel.app",
    );
  });
});

test.describe("resolveAppBaseUrl — normalisation", () => {
  test("a trailing slash never doubles the slash in a built URL", () => {
    const base = resolveAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://a.example.com/" }, null);
    expect(base).toBe("https://a.example.com");
    expect(oauthCallbackUrl(base, "calendly")).toBe(
      "https://a.example.com/api/integrations/oauth/calendly/callback",
    );
  });

  test("several trailing slashes are still stripped", () => {
    expect(
      resolveAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://a.example.com///" }, null),
    ).toBe("https://a.example.com");
  });

  test("a bare host gains https — Vercel vars have no scheme", () => {
    expect(resolveAppBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "dt.vercel.app" }, null)).toBe(
      "https://dt.vercel.app",
    );
  });

  test("an http:// localhost base is left alone for local dev", () => {
    expect(
      resolveAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }, null),
    ).toBe("http://localhost:3000");
  });

  test("blank and whitespace-only values are ignored, not used", () => {
    expect(
      resolveAppBaseUrl(
        { NEXT_PUBLIC_SITE_URL: "   ", NEXT_PUBLIC_APP_URL: "https://real.example.com" },
        null,
      ),
    ).toBe("https://real.example.com");
  });
});

test.describe("derived URLs resolve correctly", () => {
  const base = "https://app.driven-talent.com";

  test("every provider's OAuth callback is under the resolved base", () => {
    for (const p of ["calendly", "ringcentral", "pandadoc"]) {
      expect(oauthCallbackUrl(base, p)).toBe(
        `${base}/api/integrations/oauth/${p}/callback`,
      );
    }
  });

  test("every provider's webhook is under the resolved base", () => {
    for (const p of ["calendly", "ringcentral", "pandadoc", "indeed", "uattend"]) {
      expect(webhookUrl(base, p)).toBe(`${base}/api/integrations/webhook/${p}`);
    }
  });

  test("the webhook path matches what the proxy allowlists", () => {
    // If these two ever disagree, the callbacks 307 to /login again — the PR #79
    // outage, reintroduced by a path typo.
    for (const p of ["calendly", "ringcentral", "pandadoc", "indeed", "uattend"]) {
      expect(webhookUrl(base, p)).toBe(`${base}${webhookPathFor(p)}`);
    }
  });

  test("the OAuth callback path matches the route that actually exists", () => {
    // src/app/api/integrations/oauth/[provider]/callback/route.ts
    expect(oauthCallbackUrl(base, "calendly")).toContain(
      "/api/integrations/oauth/calendly/callback",
    );
  });
});
