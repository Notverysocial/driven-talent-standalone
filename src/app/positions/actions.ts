"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PositionStatus } from "@/lib/recruiting";

function num(v: FormDataEntryValue | null): number | null {
  const s = (v as string)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createPosition(formData: FormData) {
  const sb = await createClient();

  const { data, error } = await sb
    .from("positions")
    .insert({
      role_title:      (formData.get("role_title") as string).trim(),
      client_id:       (formData.get("client_id") as string) || null,
      department:      (formData.get("department") as string)?.trim() || null,
      shift:           (formData.get("shift") as string)?.trim() || null,
      pay_rate:        num(formData.get("pay_rate")),
      pay_rate_unit:   (formData.get("pay_rate_unit") as string) || "hourly",
      headcount:       num(formData.get("headcount")) ?? 1,
      requirements:    (formData.get("requirements") as string)?.trim() || null,
      recruiting_notes: (formData.get("recruiting_notes") as string)?.trim() || null,
      needed_by:       (formData.get("needed_by") as string)?.trim() || null,
      recruiter:       (formData.get("recruiter") as string)?.trim() || null,
      status:          "open" satisfies PositionStatus,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/positions");
  redirect(`/positions/${data.id}`);
}

export async function updatePosition(positionId: string, formData: FormData) {
  const sb = await createClient();

  const patch: Record<string, unknown> = {
    role_title:      (formData.get("role_title") as string).trim(),
    client_id:       (formData.get("client_id") as string) || null,
    department:      (formData.get("department") as string)?.trim() || null,
    shift:           (formData.get("shift") as string)?.trim() || null,
    pay_rate:        num(formData.get("pay_rate")),
    pay_rate_unit:   (formData.get("pay_rate_unit") as string) || "hourly",
    headcount:       num(formData.get("headcount")) ?? 1,
    requirements:    (formData.get("requirements") as string)?.trim() || null,
    recruiting_notes:(formData.get("recruiting_notes") as string)?.trim() || null,
    needed_by:       (formData.get("needed_by") as string)?.trim() || null,
    recruiter:       (formData.get("recruiter") as string)?.trim() || null,
  };

  const { error } = await sb.from("positions").update(patch).eq("id", positionId);
  if (error) throw new Error(error.message);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
}

export async function setPositionStatus(
  positionId: string,
  status: PositionStatus,
) {
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
  const sb = await createClient();

  const employeeId = (formData.get("employee_id") as string) || null;
  const candidateId = (formData.get("candidate_id") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!employeeId && !candidateId) {
    throw new Error("Pick an employee or candidate to record a placement.");
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
