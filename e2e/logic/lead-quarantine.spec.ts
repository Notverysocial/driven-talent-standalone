import { test, expect } from "@playwright/test";
import {
  QUARANTINE_MARKER,
  clearedSourceDetail,
  isQuarantined,
  quarantineReasons,
  quarantineScore,
} from "../../src/lib/lead-quarantine";

// The reading half of the employer-lead spam quarantine.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// The public staffing-request form was being filled in daily by a bot. Every
// submission landed in `sales_leads` as source='inbound_web', which is what the
// notification sweep, the Dashboard widget, the KPI tile and the sidebar badge
// all read — so each piece of junk became an alert and the real employer lead
// beside it stopped being noticed.
//
// The site now files a suspicious submission as quarantined instead: still
// written down in full, but under source='other' with a marker leading
// `source_detail`. This file pins down the three things that have to hold for
// that to be safe:
//
//   1. a quarantined lead is recognised, so it stays out of the notify sweep;
//   2. an ordinary lead is NOT, no matter what else is in source_detail;
//   3. restoring one strips the marker and keeps everything else — the form it
//      came from, its UTM tags, the IP tag the site's rate limiter counts.
//
// The marker string is a contract with the OTHER repo
// (driven-talent-site/src/lib/spam/quarantine.ts), which writes these rows.
// The first test guards the literal, because a silent rename in either repo
// means every quarantined lead quietly starts getting emailed again.

const QUARANTINED =
  'quarantined-spam | public-site-employers-form | score=185 | reasons=honeypot field was filled; company name reads as random text: "XZSfhLwzLoidFc" | ip=df21dec6bc88';

const CLEAN = "public-site-employers-form | utm_source=google | ip=df21dec6bc88";

test.describe("quarantine marker contract", () => {
  test("the marker literal is what the site repo writes", () => {
    // driven-talent-site/src/lib/spam/quarantine.ts exports this exact string.
    expect(QUARANTINE_MARKER).toBe("quarantined-spam");
  });

  test("the marker leads source_detail, so a prefix match is enough", () => {
    expect(QUARANTINED.startsWith(QUARANTINE_MARKER)).toBe(true);
  });
});

test.describe("isQuarantined", () => {
  test("recognises a lead the site quarantined", () => {
    expect(isQuarantined({ source_detail: QUARANTINED })).toBe(true);
  });

  test("leaves an ordinary inbound lead alone", () => {
    expect(isQuarantined({ source_detail: CLEAN })).toBe(false);
  });

  test("handles a lead with no source_detail at all", () => {
    expect(isQuarantined({ source_detail: null })).toBe(false);
    expect(isQuarantined({ source_detail: "" })).toBe(false);
  });

  // A hand-typed lead whose notes happen to mention the word is not quarantined.
  // Only the site, writing the marker at the FRONT, can quarantine something.
  test("does not fire on the word appearing later in the detail", () => {
    expect(
      isQuarantined({ source_detail: "referral | not quarantined-spam at all" }),
    ).toBe(false);
  });
});

test.describe("reading the flag for a human", () => {
  test("pulls out the reasons the site recorded", () => {
    expect(quarantineReasons({ source_detail: QUARANTINED })).toEqual([
      "honeypot field was filled",
      'company name reads as random text: "XZSfhLwzLoidFc"',
    ]);
  });

  test("pulls out the score", () => {
    expect(quarantineScore({ source_detail: QUARANTINED })).toBe(185);
  });

  test("returns nothing for a lead that is not quarantined", () => {
    expect(quarantineReasons({ source_detail: CLEAN })).toEqual([]);
  });

  // An older quarantined row, or one written by a future site version that
  // formats the detail differently, must render rather than throw — this feeds
  // a page.
  test("degrades to empty rather than throwing on an unfamiliar detail", () => {
    const odd = { source_detail: `${QUARANTINE_MARKER} | something else` };
    expect(isQuarantined(odd)).toBe(true);
    expect(quarantineReasons(odd)).toEqual([]);
    expect(quarantineScore(odd)).toBe(null);
  });
});

test.describe("restoring a lead a human says is real", () => {
  test("strips the marker, the score and the reasons", () => {
    const cleared = clearedSourceDetail({ source_detail: QUARANTINED });
    expect(cleared).not.toContain(QUARANTINE_MARKER);
    expect(cleared).not.toContain("score=");
    expect(cleared).not.toContain("reasons=");
  });

  // The provenance is still true after a restore, and the IP tag is what the
  // site's durable rate limiter counts — dropping it would quietly reset the
  // per-address budget for whoever submitted it.
  test("keeps the provenance and the rate-limiter tag", () => {
    const cleared = clearedSourceDetail({ source_detail: QUARANTINED });
    expect(cleared).toContain("public-site-employers-form");
    expect(cleared).toContain("ip=df21dec6bc88");
  });

  test("a restored lead no longer reads as quarantined", () => {
    const cleared = clearedSourceDetail({ source_detail: QUARANTINED });
    expect(isQuarantined({ source_detail: cleared })).toBe(false);
  });

  test("returns null rather than an empty string when nothing is left", () => {
    expect(
      clearedSourceDetail({ source_detail: `${QUARANTINE_MARKER} | score=99` }),
    ).toBe(null);
  });

  test("is harmless on a lead that was never quarantined", () => {
    expect(clearedSourceDetail({ source_detail: CLEAN })).toBe(CLEAN);
  });
});

test.describe("the surfaces that must stay quiet", () => {
  // These mirror the queries in inbound-leads.server.ts and
  // inbound-lead-email.server.ts: both select source='inbound_web'. A
  // quarantined lead is filed under 'other', so it is invisible to them by
  // construction — this pins that reasoning down so a later "let's show all
  // sources on the dashboard" change fails here first.
  const leads = [
    { source: "inbound_web", source_detail: CLEAN, company: "Inland Empire Logistics" },
    { source: "other", source_detail: QUARANTINED, company: "XZSfhLwzLoidFc" },
  ];

  test("the dashboard / notify query shape sees only the real lead", () => {
    const visible = leads.filter((l) => l.source === "inbound_web");
    expect(visible.map((l) => l.company)).toEqual(["Inland Empire Logistics"]);
  });

  test("the marker check catches a quarantined lead even if its source is edited", () => {
    const edited = { source: "inbound_web", source_detail: QUARANTINED };
    const visible = [edited].filter(
      (l) => l.source === "inbound_web" && !isQuarantined(l),
    );
    expect(visible).toEqual([]);
  });
});
