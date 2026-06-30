// Client-safe PEOPLEASE forms template — pure data, no Supabase imports.
//
// Mirrors the PEOPLEASE (PrismHR) new-hire forms packet so each employee's
// completion status can be tracked form-by-form inside the app, instead of
// operators eyeballing the PEOPLEASE portal (task 86e20w8v9). PEOPLEASE has no
// API (see DT-INTEGRATIONS-STATUS.md #11), so status is set manually here.
//
// `key` is the stable identifier stored on employee_peoplease_forms.form_key.
// Order is significant — the panel renders top-to-bottom in this sequence.

import type { PeopleaseFormStatus } from "./supabase/types";

export type PeopleaseFormTemplateItem = {
  key: string;
  label: string;
  detail: string;
  ord: number;
};

export const PEOPLEASE_FORMS: PeopleaseFormTemplateItem[] = [
  { key: "general_info",    label: "General information sheet",          detail: "Personal data: legal name, address, SSN, DOB, contact",        ord: 1 },
  { key: "i9",              label: "I-9 — Employment eligibility",       detail: "Section 1 (employee) + Section 2 (ID verification) complete",  ord: 2 },
  { key: "w4",              label: "W-4 — Federal tax withholding",      detail: "Federal withholding election on file (a.k.a. the W-2 setup)",  ord: 3 },
  { key: "state_tax",       label: "State tax withholding (DE-4)",       detail: "California DE-4 withholding election on file",                 ord: 4 },
  { key: "direct_deposit",  label: "Direct deposit authorization",       detail: "Bank routing/account + voided check, or pay-card opt-in",      ord: 5 },
  { key: "emergency",       label: "Emergency contact form",             detail: "At least one emergency contact with phone number",             ord: 6 },
  { key: "eeo_selfid",      label: "EEO / voluntary self-identification", detail: "Voluntary; record as N/A if the employee declines",           ord: 7 },
  { key: "handbook_ack",    label: "Handbook acknowledgment",            detail: "Signed acknowledgment of receipt of the employee handbook",    ord: 8 },
];

export const PEOPLEASE_FORM_STATUSES: {
  id: PeopleaseFormStatus;
  label: string;
  tone: "warm" | "amber" | "green" | "dark";
}[] = [
  { id: "pending",     label: "Pending",     tone: "warm"  },
  { id: "in_progress", label: "In Progress", tone: "amber" },
  { id: "complete",    label: "Complete",    tone: "green" },
  { id: "na",          label: "N/A",         tone: "dark"  },
];

// Completion %: forms marked complete over total non-N/A forms. N/A forms are
// excluded from numerator and denominator (mirrors onboarding calcProgress).
export function calcFormsProgress(
  forms: { status: PeopleaseFormStatus }[],
): { pct: number; complete: number; relevant: number } {
  const relevant = forms.filter((f) => f.status !== "na").length;
  const complete = forms.filter((f) => f.status === "complete").length;
  return {
    pct: relevant === 0 ? 0 : Math.round((complete / relevant) * 100),
    complete,
    relevant,
  };
}
