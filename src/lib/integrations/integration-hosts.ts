// THE list of third-party hosts this app talks to.
//
// WHY THIS EXISTS (2026-07-19): the uAttend punch feed pointed at
// `https://api.uattend.com`, a hostname with no DNS record. It never worked —
// not "stopped working", never, from its first commit. The real host,
// `api.workwelltech.com`, was already correct in a DIFFERENT uAttend client in
// the same repo. One had been corrected against the vendor's docs; the other
// was forgotten.
//
// The generalisable defect was not the typo. It was that two modules each
// carried their own copy of the same vendor's base URL, so correcting one left
// the other silently wrong. Nothing reported it: both compiled, both passed
// review, and one of them demonstrably worked.
//
// So: every third-party host is declared HERE, once. A host literal anywhere
// else in the integration layer is a second copy waiting to drift, and
// `e2e/logic/integration-hosts.spec.ts` fails the build on one.
//
// Adding a vendor? Add it here and import it. Do not inline the URL.
// Changing a vendor's host? There is exactly one line to change.

export type IntegrationHostKey =
  | "uattend"
  | "calendlyApi"
  | "calendlyAuth"
  | "pandadocApi"
  | "pandadocApp"
  | "indeedApi"
  | "prismhr"
  | "ringcentralProd"
  | "ringcentralSandbox";

/**
 * Origin only — scheme + host, no path, no trailing slash. Paths belong with
 * the code that calls them; keeping them out of here is what lets the
 * DNS-resolution job (scripts/check-integration-hosts.mjs) treat every value
 * as a hostname it can look up.
 */
export const INTEGRATION_HOSTS: Record<IntegrationHostKey, string> = {
  // uAttend is sold as "uAttend" but its API is WorkwellTech's. That mismatch
  // is exactly what made `api.uattend.com` look plausible for months.
  uattend: "https://api.workwelltech.com",

  calendlyApi: "https://api.calendly.com",
  calendlyAuth: "https://auth.calendly.com",

  pandadocApi: "https://api.pandadoc.com",
  pandadocApp: "https://app.pandadoc.com",

  indeedApi: "https://apis.indeed.com",

  prismhr: "https://api.prismhr.com",

  ringcentralProd: "https://platform.ringcentral.com",
  ringcentralSandbox: "https://platform.devtest.ringcentral.com",
};

/** Every declared host, for the resolver script and the guard test. */
export const ALL_INTEGRATION_HOSTS: readonly string[] =
  Object.values(INTEGRATION_HOSTS);

/** Bare hostname (no scheme) — what a DNS lookup actually takes. */
export function hostnameOf(origin: string): string {
  return origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
