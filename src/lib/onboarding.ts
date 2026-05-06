// Client-safe onboarding constants — pure data, no Supabase imports.

import type {
  OnboardingCategory,
  OnboardingStatus,
} from "./supabase/types";

export type ChecklistTemplateItem = {
  key: string;
  label: string;
  detail: string;
  category: OnboardingCategory;
  ord: number;
};

// Estefany's 13-item onboarding flow. Order is significant — operators
// follow this sequence top-to-bottom.
export const ONBOARDING_TEMPLATE: ChecklistTemplateItem[] = [
  { key: "personal_info",     label: "Employee personal information received",          detail: "Verify ID, address, emergency contacts on file",                category: "Documentation", ord: 1 },
  { key: "welcome_email",     label: "Welcome letter sent by email",                    detail: "Generated from template; sent to candidate's personal email",   category: "Documentation", ord: 2 },
  { key: "welcome_pandadocs", label: "Welcome letter via PandaDocs",                    detail: "Signature required",                                              category: "Documentation", ord: 3 },
  { key: "agreement",         label: "Agreement and Expectations document signed",     detail: "Signature required; varies by client",                            category: "Compliance",    ord: 4 },
  { key: "orientation",       label: "Orientation scheduled",                            detail: "Date, time, person in charge",                                    category: "Training",      ord: 5 },
  { key: "agreement_copy",    label: "Copy of agreements + orientation sent to employee", detail: "PDFs forwarded after signing + orientation confirmation",     category: "Documentation", ord: 6 },
  { key: "background",        label: "Background check completed",                       detail: "Client-dependent; check whether client requires it",             category: "Compliance",    ord: 7 },
  { key: "badge_id",          label: "Badge ID issued",                                  detail: "Site badge issued and confirmed in hand",                        category: "Equipment",     ord: 8 },
  { key: "clock_setup",       label: "Clock setup",                                      detail: "Time clock provisioned at site",                                 category: "Equipment",     ord: 9 },
  { key: "uattend_register",  label: "UAttend registration",                             detail: "Employee registered in UAttend portal",                          category: "Equipment",    ord: 10 },
  { key: "peo_uattend",       label: "PEO ID assigned in UAttend",                       detail: "PEO identifier mapped to UAttend record",                        category: "Equipment",    ord: 11 },
  { key: "sexual_harassment", label: "Sexual harassment training completed",             detail: "In-person OR online certificate on file",                        category: "Compliance",   ord: 12 },
  { key: "active_folder",     label: "Active employee folder created",                   detail: "All signed docs uploaded to the employee's folder",              category: "Documentation",ord: 13 },
];

export const ONBOARDING_STATUSES: { id: OnboardingStatus; label: string; tone: "warm" | "amber" | "green" | "dark" }[] = [
  { id: "not_started", label: "Not Started", tone: "warm"  },
  { id: "in_progress", label: "In Progress", tone: "amber" },
  { id: "done",        label: "Done",        tone: "green" },
  { id: "na",          label: "N/A",         tone: "dark"  },
];

// Progress %: items marked Done over total non-N/A items. N/A items are
// excluded from both numerator and denominator (a step that doesn't apply
// shouldn't drag the progress bar down).
export function calcProgress(items: { status: OnboardingStatus }[]): { pct: number; done: number; relevant: number } {
  const relevant = items.filter((i) => i.status !== "na").length;
  const done = items.filter((i) => i.status === "done").length;
  return {
    pct: relevant === 0 ? 0 : Math.round((done / relevant) * 100),
    done,
    relevant,
  };
}

// All non-N/A items must be "done". Used to gate auto-promotion onboarding → active.
export function isOnboardingComplete(items: { status: OnboardingStatus }[]): boolean {
  if (items.length === 0) return false;
  return items.every((i) => i.status === "done" || i.status === "na");
}
