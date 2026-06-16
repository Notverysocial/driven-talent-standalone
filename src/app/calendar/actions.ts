"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEventKind } from "@/lib/supabase/types";

const VALID_KINDS: CalendarEventKind[] = [
  "birthday",
  "holiday",
  "social_post",
  "internal",
  "custom",
];

export type EventInput = {
  kind: CalendarEventKind;
  title: string;
  description?: string | null;
  event_date: string;           // YYYY-MM-DD
  start_time?: string | null;   // HH:MM
  end_time?: string | null;     // HH:MM
  all_day?: boolean;
  location?: string | null;
  link_url?: string | null;
  assignee_name?: string | null;
  employee_id?: string | null;
  client_id?: string | null;
  color_hex?: string | null;
  created_by?: string | null;
};

function normalize(input: EventInput) {
  if (!VALID_KINDS.includes(input.kind)) {
    throw new Error(`Invalid event kind: ${input.kind}`);
  }
  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.event_date)) {
    throw new Error("event_date must be YYYY-MM-DD");
  }
  const allDay = input.all_day ?? !(input.start_time || input.end_time);

  // HH:MM -> HH:MM:00 for Postgres time
  const toTime = (v?: string | null) => {
    if (!v) return null;
    if (/^\d{2}:\d{2}$/.test(v)) return v + ":00";
    if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
    throw new Error("Times must be HH:MM");
  };

  const color = input.color_hex?.trim() || null;
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error("color_hex must be #RRGGBB");
  }

  return {
    kind: input.kind,
    title,
    description: input.description?.trim() || null,
    event_date: input.event_date,
    start_time: allDay ? null : toTime(input.start_time),
    end_time: allDay ? null : toTime(input.end_time),
    all_day: allDay,
    location: input.location?.trim() || null,
    link_url: input.link_url?.trim() || null,
    assignee_name: input.assignee_name?.trim() || null,
    employee_id: input.employee_id || null,
    client_id: input.client_id || null,
    color_hex: color,
    created_by: input.created_by?.trim() || null,
  };
}

export async function createEvent(input: EventInput) {
  const supabase = await createClient();
  const row = normalize(input);
  const { error } = await supabase.from("calendar_events").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
}

export async function updateEvent(id: string, input: EventInput) {
  if (!id) throw new Error("id is required");
  const supabase = await createClient();
  const row = normalize(input);
  const { error } = await supabase
    .from("calendar_events")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
}

// Drag-to-move: only changes the date. Time/duration preserved.
export async function moveEvent(id: string, newDate: string) {
  if (!id) throw new Error("id is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    throw new Error("newDate must be YYYY-MM-DD");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .update({ event_date: newDate })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
}

export async function deleteEvent(id: string) {
  if (!id) throw new Error("id is required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
}
