import "server-only";
import { createClient } from "./supabase/server";
import { ONBOARDING_TEMPLATE } from "./onboarding";
import { PEOPLEASE_FORMS } from "./peoplease-forms";
import type {
  Client,
  Employee,
  EmployeeAssignment,
  EmployeePeopleaseForm,
  OnboardingChecklistItem,
  OnboardingDocument,
  WelcomeLetterDraft,
} from "./supabase/types";

// PEOPLEASE new-hire forms tracker (task 86e20w8v9). Self-heals: materializes
// the PEOPLEASE_FORMS template for the employee on first access, idempotently
// (mirrors the checklist self-heal in getOnboardingDetail). Returns rows
// ordered by the template sequence.
export async function getPeopleaseForms(
  employeeId: string,
): Promise<EmployeePeopleaseForm[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employee_peoplease_forms")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw new Error(error.message);

  let forms = (data ?? []) as EmployeePeopleaseForm[];

  // Materialize any template forms this employee doesn't have yet. Covers both
  // brand-new employees (empty) and template additions after seeding.
  const haveKeys = new Set(forms.map((f) => f.form_key));
  const missing = PEOPLEASE_FORMS.filter((t) => !haveKeys.has(t.key));
  if (missing.length > 0) {
    const { data: created, error: insErr } = await supabase
      .from("employee_peoplease_forms")
      .insert(
        missing.map((t) => ({
          employee_id: employeeId,
          form_key: t.key,
          label: t.label,
          status: "pending" as const,
        })),
      )
      .select();
    if (insErr) throw new Error(insErr.message);
    forms = forms.concat((created ?? []) as EmployeePeopleaseForm[]);
  }

  const orderByKey = new Map(PEOPLEASE_FORMS.map((t) => [t.key, t.ord]));
  forms.sort((a, b) => (orderByKey.get(a.form_key) ?? 999) - (orderByKey.get(b.form_key) ?? 999));
  return forms;
}

export type OnboardingSummary = {
  employee: Employee;
  totalSteps: number;
  doneSteps: number;
  naSteps: number;
};

export async function listOnboardingSummaries(): Promise<OnboardingSummary[]> {
  const supabase = await createClient();
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .eq("status", "onboarding")
    .order("hire_date", { ascending: false });
  if (error) throw new Error(error.message);
  if (!employees || employees.length === 0) return [];

  const ids = employees.map((e) => e.id);

  const { data: items, error: itemsErr } = await supabase
    .from("onboarding_checklist_items")
    .select("employee_id, status")
    .in("employee_id", ids);
  if (itemsErr) throw new Error(itemsErr.message);

  const rows = (items ?? []) as { employee_id: string; status: string }[];

  return (employees as Employee[]).map((e) => {
    const mine = rows.filter((r) => r.employee_id === e.id);
    return {
      employee: e,
      totalSteps: mine.length,
      doneSteps: mine.filter((c) => c.status === "done").length,
      naSteps: mine.filter((c) => c.status === "na").length,
    };
  });
}

export type OnboardingDetail = {
  employee: Employee;
  checklist: OnboardingChecklistItem[];
  documents: OnboardingDocument[];
  primaryAssignment: (EmployeeAssignment & { client: Client }) | null;
  welcomeLetter: WelcomeLetterDraft | null;
};

export async function getOnboardingDetail(employeeId: string): Promise<OnboardingDetail | null> {
  const supabase = await createClient();

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!emp) return null;

  const [checkRes, docRes, assignRes, letterRes] = await Promise.all([
    supabase
      .from("onboarding_checklist_items")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at"),
    supabase
      .from("onboarding_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("name"),
    supabase
      .from("employee_assignments")
      .select("*, clients(*)")
      .eq("employee_id", employeeId)
      .eq("active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("welcome_letter_drafts")
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle(),
  ]);

  if (checkRes.error) throw new Error(checkRes.error.message);
  if (docRes.error) throw new Error(docRes.error.message);
  if (assignRes.error) throw new Error(assignRes.error.message);
  if (letterRes.error) throw new Error(letterRes.error.message);

  let checklist = (checkRes.data ?? []) as OnboardingChecklistItem[];

  // Self-heal: if the employee predates the new template, materialize the
  // 13 items so the UI has rows to render. Idempotent because we check
  // existing keys first.
  if (checklist.length === 0) {
    const { data: created, error: ins } = await supabase
      .from("onboarding_checklist_items")
      .insert(
        ONBOARDING_TEMPLATE.map((t) => ({
          employee_id: employeeId,
          key: t.key,
          label: t.label,
          detail: t.detail,
          category: t.category,
          status: "not_started" as const,
        })),
      )
      .select();
    if (ins) throw new Error(ins.message);
    checklist = (created ?? []) as OnboardingChecklistItem[];
  }

  // Sort by template order (DB insertion order isn't guaranteed)
  const orderByKey = new Map(ONBOARDING_TEMPLATE.map((t) => [t.key, t.ord]));
  checklist.sort((a, b) => (orderByKey.get(a.key) ?? 999) - (orderByKey.get(b.key) ?? 999));

  type AssignmentRow = EmployeeAssignment & { clients: Client };
  const aData = assignRes.data as unknown as AssignmentRow | null;
  const primaryAssignment = aData ? { ...aData, client: aData.clients } : null;

  return {
    employee: emp as Employee,
    checklist,
    documents: (docRes.data ?? []) as OnboardingDocument[],
    primaryAssignment,
    welcomeLetter: (letterRes.data as WelcomeLetterDraft | null) ?? null,
  };
}

// Used by the recruiting → hire flow to give a brand-new employee the
// full 13-item template at once.
export async function seedTemplateForEmployee(employeeId: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("onboarding_checklist_items")
    .select("key")
    .eq("employee_id", employeeId);
  const haveKeys = new Set(((existing ?? []) as { key: string }[]).map((r) => r.key));
  const missing = ONBOARDING_TEMPLATE.filter((t) => !haveKeys.has(t.key));
  if (missing.length === 0) return;
  const { error } = await supabase.from("onboarding_checklist_items").insert(
    missing.map((t) => ({
      employee_id: employeeId,
      key: t.key,
      label: t.label,
      detail: t.detail,
      category: t.category,
      status: "not_started" as const,
    })),
  );
  if (error) throw new Error(error.message);
}

// Build a default welcome-letter body from employee + assignment data.
// The operator edits it in the UI before sending.
export function generateWelcomeLetterBody(
  emp: Employee,
  assignment: { position: string; client: { name: string }; hourly_rate: number; start_date: string | null } | null,
): string {
  const startDate = assignment?.start_date ?? emp.hire_date ?? "your first day";
  const fmtDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? new Date(startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : startDate;
  const role = assignment?.position ?? "your role";
  const client = assignment?.client.name ?? "our client";
  const rate = assignment?.hourly_rate ? `$${Number(assignment.hourly_rate).toFixed(2)}/hr` : "your agreed rate";
  const inCharge = emp.onboarding_in_charge ?? "your onboarding coordinator";

  return `Hi ${emp.full_name.split(" ")[0]},

Welcome to Driven Talent — we're excited to have you joining us.

You'll be starting as ${role} at ${client} on ${fmtDate} at ${rate}. ${inCharge} is your point of contact for everything onboarding-related; please reach out with any questions before your start date.

In the next day or two you'll receive a separate e-signature request for the Welcome Letter and the Agreement and Expectations document — it will come from our signing platform with a one-click link. Both require your signature before your first shift. We'll also confirm the orientation date/time once it's scheduled.

What we need from you in the meantime:
- Your most recent ID and Social Security card (for I-9 verification)
- A current contact address and an emergency contact
- Direct deposit info on the form attached

Looking forward to meeting you.

— Driven Talent
   workforce solutions`;
}
