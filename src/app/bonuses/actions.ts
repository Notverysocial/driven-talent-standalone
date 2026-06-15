"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BonusKind, BonusStatus } from "@/lib/bonuses";

const KINDS: BonusKind[] = ["recruiter", "referral"];
const STATUSES: BonusStatus[] = ["pending", "approved", "paid", "void"];

// All fields the form may submit. Captured verbatim so we can re-hydrate
// the form when validation or the DB rejects the submission.
export type BonusFormValues = {
  kind: string;
  amount: string;
  earned_date: string;
  recruiter_name: string;
  referrer_employee_id: string;
  employee_id: string;
  candidate_id: string;
  subject_name: string;
  position_id: string;
  client_id: string;
  notes: string;
};

export type BonusFormErrors = Partial<Record<keyof BonusFormValues | "_form", string>>;

export type BonusFormState =
  | { ok: true }
  | { ok: false; errors: BonusFormErrors; values: BonusFormValues };

function raw(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

function nullable(v: string): string | null {
  return v ? v : null;
}

function captureValues(formData: FormData): BonusFormValues {
  return {
    kind: raw(formData, "kind"),
    amount: raw(formData, "amount"),
    earned_date: raw(formData, "earned_date"),
    recruiter_name: raw(formData, "recruiter_name"),
    referrer_employee_id: raw(formData, "referrer_employee_id"),
    employee_id: raw(formData, "employee_id"),
    candidate_id: raw(formData, "candidate_id"),
    subject_name: raw(formData, "subject_name"),
    position_id: raw(formData, "position_id"),
    client_id: raw(formData, "client_id"),
    notes: raw(formData, "notes"),
  };
}

export async function createBonus(
  _prev: BonusFormState | undefined,
  formData: FormData,
): Promise<BonusFormState> {
  const values = captureValues(formData);
  const errors: BonusFormErrors = {};

  const kind = (values.kind || "recruiter") as BonusKind;
  if (!KINDS.includes(kind)) {
    errors.kind = `Invalid kind: ${values.kind}`;
  }

  const amountNum = values.amount ? Number(values.amount) : NaN;
  if (!values.amount) {
    errors.amount = "Amount is required";
  } else if (!Number.isFinite(amountNum) || amountNum < 0) {
    errors.amount = "Amount must be a non-negative number";
  }

  // Uniform "who is being paid" guard, applied per kind.
  if (kind === "recruiter" && !values.recruiter_name) {
    errors.recruiter_name = "Recruiter name is required for recruiter bonuses";
  }
  if (kind === "referral" && !values.referrer_employee_id) {
    errors.referrer_employee_id = "Referring employee is required for referral bonuses";
  }

  // Uniform "about the hire" guard, applied to every kind. The original 500
  // came from this requirement being a thrown Error rather than a returned
  // validation message.
  if (!values.employee_id && !values.candidate_id && !values.subject_name) {
    errors.subject_name =
      "Provide the placed employee, candidate, or a name under 'About the hire'.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  const sb = await createClient();
  const earnedDate = values.earned_date || new Date().toISOString().slice(0, 10);

  const { error } = await sb.from("bonuses").insert({
    kind,
    status: "pending" satisfies BonusStatus,
    amount: amountNum,
    recruiter_name: kind === "recruiter" ? nullable(values.recruiter_name) : null,
    referrer_employee_id: kind === "referral" ? nullable(values.referrer_employee_id) : null,
    employee_id: nullable(values.employee_id),
    candidate_id: nullable(values.candidate_id),
    subject_name: nullable(values.subject_name),
    position_id: nullable(values.position_id),
    client_id: nullable(values.client_id),
    earned_date: earnedDate,
    notes: nullable(values.notes),
  });

  if (error) {
    return {
      ok: false,
      errors: { _form: `Couldn't save bonus: ${error.message}` },
      values,
    };
  }

  revalidatePath("/bonuses");
  return { ok: true };
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
  const paidAt = (formData.get("paid_at") as string | null)?.trim() || new Date().toISOString().slice(0, 10);
  const payoutMethod = ((formData.get("payout_method") as string | null) ?? "").trim() || null;
  const payoutReference = ((formData.get("payout_reference") as string | null) ?? "").trim() || null;

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
