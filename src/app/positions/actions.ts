"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  sendBar,
  sendBarRefusal,
  type SendBarInput,
} from "@/lib/candidate-eligibility";
import type { PositionStatus } from "@/lib/recruiting";
import { pingPublicRevalidate } from "@/lib/public-revalidate.server";
import { requireUser } from "@/lib/auth.server";

function num(v: FormDataEntryValue | null): number | null {
  const s = (v as string)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(fd: FormData, key: string): string | null {
  return (fd.get(key) as string)?.trim() || null;
}

/**
 * Checkbox value. The form submits a hidden "0" before every checkbox, so an
 * UNCHECKED box still sends a value and can be turned OFF. Reading only
 * `get()` would take the hidden "0" and a ticked box would never save; reading
 * the LAST entry gives "1" when ticked and "0" when not.
 */
function bool(fd: FormData, key: string): boolean {
  const all = fd.getAll(key);
  return all.length > 0 && all[all.length - 1] === "1";
}

/**
 * Every column the admin form writes, in one place, so create and update
 * cannot drift apart — the original pair already had that problem in miniature
 * (update carried no `status`, create hardcoded it).
 *
 * Migration 0018 added 25 columns and nothing surfaced them, so a recruiter
 * could not enter city, pay range, schedule, or skills at all. The public
 * careers page renders from this table, hence the audience split below.
 */
function positionPatchFrom(formData: FormData): Record<string, unknown> {
  return {
    // --- original 0004 fields ---
    role_title:       (formData.get("role_title") as string).trim(),
    client_id:        (formData.get("client_id") as string) || null,
    department:       str(formData, "department"),
    shift:            str(formData, "shift"),
    pay_rate:         num(formData.get("pay_rate")),
    pay_rate_unit:    (formData.get("pay_rate_unit") as string) || "hourly",
    headcount:        num(formData.get("headcount")) ?? 1,
    requirements:     str(formData, "requirements"),
    recruiting_notes: str(formData, "recruiting_notes"),
    needed_by:        str(formData, "needed_by"),
    recruiter:        str(formData, "recruiter"),

    // --- 0018, PUBLIC (renderable on driven-talent.com) ---
    company_name:        str(formData, "company_name"),
    job_category:        str(formData, "job_category"),
    city:                str(formData, "city"),
    locality:            str(formData, "locality"),
    min_pay_rate:        num(formData.get("min_pay_rate")),
    max_pay_rate:        num(formData.get("max_pay_rate")),
    schedule_hours:      str(formData, "schedule_hours"),
    start_date:          str(formData, "start_date"),
    end_date:            str(formData, "end_date"),
    bilingual:           bool(formData, "bilingual"),
    resume_required:     bool(formData, "resume_required"),
    special_skills:      str(formData, "special_skills"),
    job_description_url: str(formData, "job_description_url"),

    // --- 0018, INTERNAL (never rendered publicly) ---
    priority:         str(formData, "priority"),
    deadline_to_fill: str(formData, "deadline_to_fill"),
    posted_redes:     bool(formData, "posted_redes"),
    posted_indeed:    bool(formData, "posted_indeed"),
    posted_linkedin:  bool(formData, "posted_linkedin"),
  };
}

export async function createPosition(formData: FormData) {
  // A server action is directly invocable — gate it, not just the page.
  await requireUser();
  const sb = await createClient();

  const { data, error } = await sb
    .from("positions")
    .insert({
      ...positionPatchFrom(formData),
      status: "open" satisfies PositionStatus,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/positions");
  // Best-effort: nudge the public careers page so a new listing appears in
  // seconds rather than after its cache window. Never blocks or fails a save.
  await pingPublicRevalidate();
  redirect(`/positions/${data.id}`);
}

export async function updatePosition(positionId: string, formData: FormData) {
  // A server action is directly invocable — gate it, not just the page.
  await requireUser();
  const sb = await createClient();

  const { error } = await sb
    .from("positions")
    .update(positionPatchFrom(formData))
    .eq("id", positionId);
  if (error) throw new Error(error.message);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  await pingPublicRevalidate();
}

export async function setPositionStatus(
  positionId: string,
  status: PositionStatus,
) {
  // A server action is directly invocable — gate it, not just the page.
  await requireUser();
  const sb = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "filled") patch.filled_at = new Date().toISOString().slice(0, 10);
  if (status === "open" || status === "on_hold") patch.filled_at = null;

  const { error } = await sb.from("positions").update(patch).eq("id", positionId);
  if (error) throw new Error(error.message);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
}

export async function recordPlacement(
  positionId: string,
  formData: FormData,
) {
  // A server action is directly invocable — gate it, not just the page.
  await requireUser();
  const sb = await createClient();

  const employeeId = (formData.get("employee_id") as string) || null;
  const candidateId = (formData.get("candidate_id") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!employeeId && !candidateId) {
    throw new Error("Pick an employee or candidate to record a placement.");
  }

  // THE HARD STOP. Unlike a screening label — which is an assessment and may
  // legitimately be recorded on a barred person — this is the act of placing
  // somebody with a client. There is no valid "I meant to place a barred
  // candidate": if the bar no longer holds, it must be lifted on their record
  // first, which is a deliberate, logged action.
  //
  // Enforced server-side and not only by filtering the dropdown, because the
  // dropdown is a suggestion and this insert is the thing that reaches a client.
  if (candidateId) {
    const { data: cand } = await sb
      .from("candidates")
      .select("full_name, lifecycle_status, do_not_return_reason, do_not_send")
      .eq("id", candidateId)
      .maybeSingle();
    const bar = sendBar(cand as SendBarInput | null);
    if (bar.barred) {
      throw new Error(
        sendBarRefusal(bar, (cand as { full_name?: string } | null)?.full_name),
      );
    }
  }

  const { error: placeErr } = await sb.from("position_placements").insert({
    position_id: positionId,
    employee_id: employeeId,
    candidate_id: candidateId,
    notes,
  });
  if (placeErr) throw new Error(placeErr.message);

  // Bump the filled_count and auto-close when at headcount
  const { data: pos } = await sb
    .from("positions")
    .select("headcount, filled_count")
    .eq("id", positionId)
    .single();
  if (pos) {
    const nextFilled = (pos.filled_count ?? 0) + 1;
    const reachedHead = nextFilled >= (pos.headcount ?? 1);
    await sb
      .from("positions")
      .update({
        filled_count: nextFilled,
        status: reachedHead ? "filled" : "open",
        filled_at: reachedHead ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", positionId);
  }

  revalidatePath(`/positions/${positionId}`);
  revalidatePath("/positions");
}
