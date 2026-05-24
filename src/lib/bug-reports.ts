// Bug Reports — client-safe constants, labels, and pure helpers.

import type { BadgeTone } from "@/components/Badge";
import type { BugSeverity, BugStatus } from "./supabase/types";

export const BUG_SEVERITIES: BugSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const BUG_STATUSES: BugStatus[] = [
  "new",
  "in_progress",
  "resolved",
  "wont_fix",
  "duplicate",
];

export const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const BUG_SEVERITY_TONE: Record<BugSeverity, BadgeTone> = {
  low: "warm",
  medium: "gold",
  high: "amber",
  critical: "red",
};

// Numeric weight for sorting — higher = more urgent.
export const BUG_SEVERITY_WEIGHT: Record<BugSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  wont_fix: "Won't Fix",
  duplicate: "Duplicate",
};

export const BUG_STATUS_TONE: Record<BugStatus, BadgeTone> = {
  new: "amber",
  in_progress: "gold",
  resolved: "green",
  wont_fix: "warm",
  duplicate: "dark",
};

// Statuses that still need dev attention (drives the queue KPI + nav badge).
export const OPEN_BUG_STATUSES: BugStatus[] = ["new", "in_progress"];

export function bugIsOpen(status: BugStatus): boolean {
  return OPEN_BUG_STATUSES.includes(status);
}

export function fmtBugDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
