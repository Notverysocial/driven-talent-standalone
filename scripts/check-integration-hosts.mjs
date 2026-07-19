#!/usr/bin/env node
//
// Resolve every third-party host this app talks to.
//
// WHY: `https://api.uattend.com` was the uAttend punch feed's base URL from its
// first commit. It has no DNS record and never had one, so the feed never
// worked — but nothing noticed for months, because the cron that would have
// exercised it was separately being redirected away by the auth proxy. This
// check would have failed on the day that hostname was typed.
//
// It runs in the NON-REQUIRED workflow, deliberately. A third-party DNS blip,
// a vendor's transient outage, or a runner without egress must never block a
// merge. The signal is "someone look at this", not "stop the line".
//
// Usage: node scripts/check-integration-hosts.mjs
// Exits 1 if any host fails to resolve.

import { readFileSync } from "node:fs";
import { resolve as dnsResolve } from "node:dns/promises";

const SOURCE = "src/lib/integrations/integration-hosts.ts";

// Read the hosts out of the TS source rather than importing it — this script is
// plain node with no build step, and the module is a flat literal table by
// design (asserted by e2e/logic/integration-hosts.spec.ts).
function declaredHosts() {
  const src = readFileSync(SOURCE, "utf8");
  const table = src.slice(
    src.indexOf("export const INTEGRATION_HOSTS"),
    src.indexOf("export const ALL_INTEGRATION_HOSTS"),
  );
  const entries = [...table.matchAll(/(\w+):\s*"(https:\/\/[^"]+)"/g)].map(
    ([, key, origin]) => ({ key, origin, hostname: origin.replace(/^https:\/\//, "") }),
  );
  if (entries.length === 0) {
    console.error(
      `✗ Parsed 0 hosts from ${SOURCE}. The table's shape changed — fix this ` +
        `script rather than letting it silently check nothing.`,
    );
    process.exit(1);
  }
  return entries;
}

// Hosts already known not to resolve, with a reason and an owner.
//
// This list exists so the job is not RED ON DAY ONE. A permanently-failing
// check gets ignored, and an ignored check is worse than none — this repo has
// already lost an hour to a real regression hiding behind a chronically red
// suite. Known issues are reported loudly but do not fail the run; only a NEW
// failure does.
//
// Anything in here is a debt, not an exemption. Empty it, do not grow it.
const KNOWN_UNRESOLVABLE = {
  "platform.devtest.ringcentral.com":
    "RingCentral sandbox. NXDOMAIN at 8.8.8.8 and 1.1.1.1 (verified 2026-07-19). " +
    "Only reached when RINGCENTRAL_ENV=sandbox, so it is dormant rather than " +
    "breaking prod — but setting that env var would fail exactly the way uAttend " +
    "did. The correct current sandbox hostname must come from RingCentral's docs; " +
    "guessing one into config is how this class of bug is created.",
};

const hosts = declaredHosts();
console.log(`Resolving ${hosts.length} integration hosts from ${SOURCE}\n`);

let failed = 0;
const known = [];
await Promise.all(
  hosts.map(async ({ key, hostname }) => {
    try {
      const addrs = await dnsResolve(hostname);
      console.log(`  ✓ ${key.padEnd(20)} ${hostname} → ${addrs.slice(0, 2).join(", ")}`);
    } catch (err) {
      const code = err?.code ?? "UNKNOWN";
      if (KNOWN_UNRESOLVABLE[hostname]) {
        known.push({ key, hostname, code });
        console.warn(`  ! ${key.padEnd(20)} ${hostname} → ${code}  (known)`);
        return;
      }
      failed++;
      console.error(`  ✗ ${key.padEnd(20)} ${hostname} → ${code}`);
      if (code === "ENOTFOUND") {
        console.error(
          `      This hostname does not exist. If it is in the code, the URL is ` +
            `wrong — no credential is ever sent, so there is nothing to rotate.`,
        );
      }
    }
  }),
);

if (known.length > 0) {
  console.warn(`\n${known.length} KNOWN unresolvable host(s) — debt, not noise:`);
  for (const { key, hostname } of known) {
    console.warn(`  ! ${key} (${hostname})\n      ${KNOWN_UNRESOLVABLE[hostname]}`);
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} host(s) failed to resolve. If this is a vendor outage or a ` +
      `network blip, re-run. If a host is ENOTFOUND consistently, the URL in ` +
      `${SOURCE} is wrong and that integration cannot be working.`,
  );
  process.exit(1);
}
// Say what actually happened. "All 9 resolved" when 8 resolved and 1 is a known
// dead host is the same false-green this whole guard exists to prevent.
const resolved = hosts.length - known.length;
console.log(
  known.length === 0
    ? `\nAll ${hosts.length} hosts resolved.`
    : `\n${resolved}/${hosts.length} hosts resolved; ${known.length} known-dead (listed above).`,
);
