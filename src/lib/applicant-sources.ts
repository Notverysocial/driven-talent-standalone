// Applicant source classification for the "Applicants Per Month" chart.
//
// WHY THIS EXISTS
// Leangel asked (2026-07-08) for 12 months of applicant volume "combined across
// Website + Indeed + Facebook + LinkedIn + Instagram". What shipped was a single
// total series under a subtitle that named all five channels — so the card
// asserted a five-way split it never had. Three of those five have no
// integration in this codebase at all: there is no Facebook, LinkedIn or
// Instagram provider, and Indeed's integration row is 'disconnected'.
//
// The rule here: a channel appears ONLY when rows actually carry it. Nothing is
// invented, nothing is zero-padded to make a legend look complete, and a channel
// DT asked about but never connected simply does not appear — which is itself
// the honest answer to "how many came from Instagram?".
//
// PURE — no server imports, so the logic suite can exercise it.

export type SourceKey =
  | "website"
  | "indeed"
  | "referral"
  | "phone"
  | "recruiter"
  | "imported"
  | "unspecified";

export const SOURCE_LABEL: Record<SourceKey, string> = {
  website: "Website",
  indeed: "Indeed",
  referral: "Referral",
  phone: "Phone / Inbound call",
  recruiter: "Added by recruiter",
  imported: "Imported list",
  unspecified: "Unspecified",
};

/** Stable draw order, densest real channel first. */
export const SOURCE_ORDER: SourceKey[] = [
  "website",
  "indeed",
  "referral",
  "phone",
  "recruiter",
  "imported",
  "unspecified",
];

/**
 * Map a stored `source` string onto a channel.
 *
 * Deliberately forgiving: these values are typed by hand in the ATS and by two
 * different intake paths, so production holds "Inbound call", "Inbound Call",
 * "inbound call", "Referal" and "Referral" as separate strings for two things.
 */
export function classifyApplicantSource(raw: string | null | undefined): SourceKey {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "unspecified";

  // The website funnel, including anything already promoted out of it — a
  // promoted intake is still a website applicant, it just changed table.
  if (
    s.includes("public-site") ||
    s.includes("driven-talent.com") ||
    s.includes("jobseeker") ||
    s.includes("promoted-from-intake") ||
    s.includes("promoted-from-chat") ||
    s === "web" ||
    s === "website"
  ) {
    return "website";
  }
  if (s.includes("indeed")) return "indeed";
  // "Referal" is a real, repeated spelling in production.
  if (s.includes("refer")) return "referral";
  if (s.includes("call") || s.includes("ring central") || s.includes("ringcentral")) {
    return "phone";
  }
  if (s.includes("recruiter")) return "recruiter";
  if (s.includes("list") || s.includes("import")) return "imported";
  return "unspecified";
}

export type ApplicantRow = { created_at: string | null; source: string | null };

export type MonthBucket = { month: string; label: string; total: number } & Partial<
  Record<SourceKey, number>
>;

export type ApplicantsPerMonth = {
  months: MonthBucket[];
  /** Only channels with at least one applicant this year. Never zero-padded. */
  present: SourceKey[];
  total: number;
};

export function buildApplicantsPerMonth(
  rows: ApplicantRow[],
  year: number,
): ApplicantsPerMonth {
  const months: MonthBucket[] = [];
  const index = new Map<string, MonthBucket>();
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    const bucket: MonthBucket = {
      month: key,
      label: new Date(year, m, 1).toLocaleDateString("en-US", { month: "short" }),
      total: 0,
    };
    months.push(bucket);
    index.set(key, bucket);
  }

  const seen = new Set<SourceKey>();
  let total = 0;

  for (const r of rows) {
    if (!r.created_at) continue;
    const bucket = index.get(r.created_at.slice(0, 7));
    if (!bucket) continue; // outside the requested year
    const key = classifyApplicantSource(r.source);
    bucket[key] = (bucket[key] ?? 0) + 1;
    bucket.total += 1;
    seen.add(key);
    total += 1;
  }

  return { months, present: SOURCE_ORDER.filter((k) => seen.has(k)), total };
}
