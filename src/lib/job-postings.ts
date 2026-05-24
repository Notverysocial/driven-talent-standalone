// Types + label tables for the Job Postings module.
// Matches supabase/migrations/0007_job_postings.sql.

import type { BadgeTone } from "@/components/Badge";

export type JobPostingPlatform =
  | "indeed"
  | "facebook"
  | "linkedin"
  | "instagram";

export type JobPostingStatus = "open" | "closed";

export type JobPosting = {
  id: string;
  client_id: string | null;
  position_id: string | null;
  role_title: string;
  platform: JobPostingPlatform;
  posting_title: string | null;
  posting_url: string | null;
  status: JobPostingStatus;
  posted_at: string;
  closed_at: string | null;
  application_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const JOB_POSTING_PLATFORMS: {
  id: JobPostingPlatform;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "indeed",    label: "Indeed",    tone: "gold"  },
  { id: "linkedin",  label: "LinkedIn",  tone: "warm"  },
  { id: "facebook",  label: "Facebook",  tone: "amber" },
  { id: "instagram", label: "Instagram", tone: "dark"  },
];

export const JOB_POSTING_STATUSES: {
  id: JobPostingStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "open",   label: "Open",   tone: "gold"  },
  { id: "closed", label: "Closed", tone: "warm"  },
];

export function platformLabel(p: JobPostingPlatform): string {
  return JOB_POSTING_PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

export function platformTone(p: JobPostingPlatform): BadgeTone {
  return JOB_POSTING_PLATFORMS.find((x) => x.id === p)?.tone ?? "warm";
}
