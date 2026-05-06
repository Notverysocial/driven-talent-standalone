import type {
  CandidateCriterion,
  CandidateStatus,
} from "./supabase/types";

export const CANDIDATE_STATUSES: { id: CandidateStatus; label: string; tone: "warm" | "gold" | "amber" | "green" | "red" | "dark" }[] = [
  { id: "applied",    label: "Applied",    tone: "warm" },
  { id: "screening",  label: "Screening",  tone: "gold" },
  { id: "interview",  label: "Interview",  tone: "amber" },
  { id: "offer",      label: "Offer",      tone: "gold" },
  { id: "hired",      label: "Hired",      tone: "green" },
  { id: "rejected",   label: "Rejected",   tone: "red" },
];

// 6 evaluation criteria seeded on every new candidate so the scoring UI has
// something to render. Operator can edit values + notes after.
export const DEFAULT_CRITERIA: CandidateCriterion[] = [
  { key: "experience",   label: "Relevant Experience",  sub: "Years and depth in role",          weight: 20, value: 70, note: "" },
  { key: "skills",       label: "Hard Skills",          sub: "Certifications, technical fit",    weight: 20, value: 70, note: "" },
  { key: "soft",         label: "Communication",        sub: "Warmth, clarity, listening",       weight: 15, value: 70, note: "" },
  { key: "reliability",  label: "Reliability",          sub: "References, attendance history",   weight: 20, value: 70, note: "" },
  { key: "culture",      label: "Culture Fit",          sub: "Client environment alignment",     weight: 15, value: 70, note: "" },
  { key: "flex",         label: "Schedule Flexibility", sub: "Shifts, weekends, on-call",        weight: 10, value: 70, note: "" },
];

export function weightedScore(criteria: CandidateCriterion[]): number {
  if (criteria.length === 0) return 0;
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const sum = criteria.reduce((s, c) => s + c.value * c.weight, 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}

export function tierLabel(score: number): string {
  if (score >= 90) return "Top Tier";
  if (score >= 80) return "Strong Match";
  if (score >= 70) return "Worth a Look";
  return "Marginal";
}

export function scoreColor(v: number): string {
  if (v >= 90) return "#4F7A3A";
  if (v >= 80) return "var(--dt-gold-deep)";
  if (v >= 70) return "var(--dt-gold)";
  if (v >= 60) return "#C28B1E";
  return "#B23A3A";
}
