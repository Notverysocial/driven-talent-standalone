// CALL / SCREENING STATUS for applicants (migration 0053) — pure, client-safe.
//
// Recruiters set this inline on each /applications card. The labels are the
// team's own words, kept EXACTLY as requested (mixed case and Spanish
// included); the ids are what the database stores and must stay in step with
// the CHECK constraint in 0053_intake_call_status.sql.
//
// This is deliberately separate from application_intakes.status (the workflow
// stage: new / reviewed / promoted / rejected / spam) and from
// candidates.screening_status (candidate-only) — see the migration header.

import type { BadgeTone } from "@/components/Badge";

export type IntakeCallStatus =
  | "pendiente"
  | "llamado"
  | "calificado"
  | "no_califica"
  | "no_responde"
  | "working_now"
  | "no_interesado"
  | "dnr";

export const INTAKE_CALL_STATUSES: readonly {
  id: IntakeCallStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "pendiente",     label: "Pendiente",                    tone: "warm"  },
  { id: "llamado",       label: "Llamado",                      tone: "gold"  },
  { id: "calificado",    label: "Calificado",                   tone: "green" },
  { id: "no_califica",   label: "No Califica",                  tone: "red"   },
  { id: "no_responde",   label: "no responde, llamar de nuevo", tone: "gold"  },
  { id: "working_now",   label: "WORKING NOW",                  tone: "green" },
  { id: "no_interesado", label: "NO INTERESADO",                tone: "red"   },
  { id: "dnr",           label: "DNR",                          tone: "dark"  },
];

export const DEFAULT_INTAKE_CALL_STATUS: IntakeCallStatus = "pendiente";

export function isIntakeCallStatus(v: unknown): v is IntakeCallStatus {
  return typeof v === "string" && INTAKE_CALL_STATUSES.some((s) => s.id === v);
}

export function intakeCallStatusLabel(v: string | null | undefined): string {
  return INTAKE_CALL_STATUSES.find((s) => s.id === v)?.label ?? "Pendiente";
}
