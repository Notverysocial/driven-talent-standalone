"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BonusKind, BonusStatus } from "@/lib/bonuses";

const KINDS: BonusKind[] = ["recruiter", "referral"];
const STATUSES: BonusStatus[] = ["pending", "approved", "paid", "void"];

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createBonus(formData: FormData) {
  const sb = await createClient();

  const kind = (formData.get("kind") as BonusKind) || "recruiter";
  if (!KINDS.includes(kind)) throw new Error(`Invalid kind: ${kind}`);

  const amount = num(formData, "amount");
  if (amount == null || amount < 0) throw new Error("Amount is required");

  const earnedDate = str(formData, "earned_date") ?? new Date().toISOString().slice(0, 10);

  // Recruiter vs referral: enforce that the right "paid to" field is set.
  const recruiterName = kind === "recruiter" ? str(formData, "recruiter_name") : null;
  const referrerEmployeeId = kind === "referral" ? str(formData, "referrer_employee_id") : null;

  if (kind === "recruiter" && !recruiterName) {
    throw new Error("Recruiter name is required for recruiter bonuses");
  }
  if (kind === "referral" && !referrerEmployeeId) {
    throw new Error("Referring employee is required for referral bonuses");
  }

  const employeeId = str(formData, "employee_id");
  const candidateId = str(formData, "candidate_id");
  const subjectName = str(formData, "subject_name");

  if (!employeeId && !candidateId && !subjectName) {
    throw new Error("Provide the placed employee, candidate, or a name in 'About'.");
  }

  const { error } = await sb.from("bonuses").insert({
    kind,
    status: "pending" satisfies BonusStatus,
    amount,
    recruiter_name: recruiterName,
    referrer_employee_id: referrerEmployeeId,
    employee_id: employeeId,
    candidate_id: candidateId,
    subject_name: subjectName,
    position_id: str(formData, "position_id"),
    client_id: str(formData, "client_id"),
    earned_date: earnedDate,
    notes: str(formData, "notes"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/bonuses");
}

export async function setBonusStatus(id: string, status: BonusStatus, approvedBy?: string | null) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  const sb = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = approvedBy ?? null;
  }
  if (status === "paid") {
    patch.paid_at = new Date().toISOString().slice(0, 10);
  }
  if (status === "pending") {
    patch.approved_at = null;
    patch.approved_by = null;
    patch.paid_at = null;
  }

  const { error } = await sb.from("bonuses").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bonuses");
}

export async function markBonusPaid(id: string, formData: FormData) {
  const sb = await createClient();
  const paidAt = str(formData, "paid_at") ?? new Date().toISOString().slice(0, 10);
  const payoutMethod = str(formData, "payout_method");
  const payoutReference = str(formData, "payout_reference");

  const { error } = await sb
    .from("bonuses")
    .update({
      status: "paid" satisfies BonusStatus,
      paid_at: paidAt,
      payout_method: payoutMethod,
      payout_reference: payoutReference,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bonuses");
}
