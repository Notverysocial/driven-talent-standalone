// Calendly event-type catalog for Driven Talent.
//
// This is the single source of truth for WHICH Calendly event types the DT
// app books against and how the app references them. Antonio creates the
// matching event types in the connected Calendly account; each one gets a URL
// slug. The app builds a booking URL as `${scheduling_url}/${slug}` (the same
// shape Calendly uses for its public booking links).
//
// Slugs: each event type has a `defaultSlug` that matches the recommended
// event-type NAME (Calendly auto-slugs "Candidate Phone Screen" →
// "candidate-phone-screen", but we use the shorter canonical slugs below — set
// the event-type URL to these when creating them, OR override per-key via the
// integration row's config.event_types[key].slug without a code change).
//
// Pure module — safe to import from both Server and Client Components (no
// server-only imports, no secrets).

export type CalendlyEventKey =
  | "phone_screen"
  | "interview"
  | "onboarding"
  | "client_intake";

export interface CalendlyEventType {
  key: CalendlyEventKey;
  /** Exact event-type name to create in Calendly. */
  name: string;
  /** Default URL slug; overridable via integration.config.event_types[key].slug. */
  defaultSlug: string;
  /** Recommended duration in minutes. */
  durationMinutes: number;
  /** One-line purpose, shown in the admin Integrations card. */
  description: string;
  /** Where in the app this event type is surfaced. */
  surfacedIn: string;
}

export const CALENDLY_EVENT_TYPES: Record<CalendlyEventKey, CalendlyEventType> = {
  phone_screen: {
    key: "phone_screen",
    name: "Candidate Phone Screen",
    defaultSlug: "phone-screen",
    durationMinutes: 15,
    description: "Quick recruiter pre-screen call with a new applicant.",
    surfacedIn: "Applications intake cards + candidate detail (Applied/Screening)",
  },
  interview: {
    key: "interview",
    name: "Candidate Interview",
    defaultSlug: "interview",
    durationMinutes: 45,
    description: "Full interview with a screened candidate.",
    surfacedIn: "Candidate detail (Screening/Interview)",
  },
  onboarding: {
    key: "onboarding",
    name: "New Hire Onboarding",
    defaultSlug: "onboarding",
    durationMinutes: 30,
    description: "Orientation / paperwork session for a new hire.",
    surfacedIn: "Onboarding tracker detail",
  },
  client_intake: {
    key: "client_intake",
    name: "Client Intake",
    defaultSlug: "client-intake",
    durationMinutes: 30,
    description: "Discovery call with a prospective staffing client.",
    surfacedIn: "Integrations admin (copyable link)",
  },
};

export const CALENDLY_EVENT_LIST: CalendlyEventType[] =
  Object.values(CALENDLY_EVENT_TYPES);

export const CALENDLY_EVENT_KEYS = Object.keys(
  CALENDLY_EVENT_TYPES,
) as CalendlyEventKey[];

// Build a Calendly booking URL for an event type. `schedulingUrl` is the
// connected user's base scheduling page (e.g. https://calendly.com/driven-talent),
// discovered from /users/me during OAuth and stored on
// integration.config.scheduling_url. We append the event slug and prefill the
// invitee's name/email so the booking auto-reconciles back to the right
// candidate/contact in the Calendly webhook (which matches by email).
export function buildCalendlyBookingUrl(opts: {
  schedulingUrl: string;
  slug: string;
  name?: string | null;
  email?: string | null;
  hideGdpr?: boolean;
}): string | null {
  const base = (opts.schedulingUrl ?? "").trim().replace(/\/+$/, "");
  const slug = (opts.slug ?? "").trim().replace(/^\/+/, "");
  if (!base || !slug) return null;
  let url: URL;
  try {
    url = new URL(`${base}/${slug}`);
  } catch {
    return null;
  }
  if (opts.name) url.searchParams.set("name", opts.name);
  if (opts.email) url.searchParams.set("email", opts.email);
  if (opts.hideGdpr ?? true) url.searchParams.set("hide_gdpr_banner", "1");
  return url.toString();
}
