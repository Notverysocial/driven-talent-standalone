import "server-only";
import { createClient } from "./supabase/server";
import type {
  Employee,
  OnboardingChecklistItem,
  OnboardingDocument,
} from "./supabase/types";

export type OnboardingSummary = {
  employee: Employee;
  totalSteps: number;
  doneSteps: number;
  totalDocs: number;
  doneDocs: number;
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

  const [checkRes, docRes] = await Promise.all([
    supabase.from("onboarding_checklist_items").select("employee_id, done").in("employee_id", ids),
    supabase.from("onboarding_documents").select("employee_id, received").in("employee_id", ids),
  ]);

  if (checkRes.error) throw new Error(checkRes.error.message);
  if (docRes.error) throw new Error(docRes.error.message);

  const checks = (checkRes.data ?? []) as { employee_id: string; done: boolean }[];
  const docs = (docRes.data ?? []) as { employee_id: string; received: boolean }[];

  return (employees as Employee[]).map((e) => {
    const myChecks = checks.filter((c) => c.employee_id === e.id);
    const myDocs = docs.filter((d) => d.employee_id === e.id);
    return {
      employee: e,
      totalSteps: myChecks.length,
      doneSteps: myChecks.filter((c) => c.done).length,
      totalDocs: myDocs.length,
      doneDocs: myDocs.filter((d) => d.received).length,
    };
  });
}

export async function getOnboardingDetail(employeeId: string): Promise<{
  employee: Employee;
  checklist: OnboardingChecklistItem[];
  documents: OnboardingDocument[];
} | null> {
  const supabase = await createClient();

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!emp) return null;

  const [checkRes, docRes] = await Promise.all([
    supabase
      .from("onboarding_checklist_items")
      .select("*")
      .eq("employee_id", employeeId)
      .order("category"),
    supabase
      .from("onboarding_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("name"),
  ]);
  if (checkRes.error) throw new Error(checkRes.error.message);
  if (docRes.error) throw new Error(docRes.error.message);

  return {
    employee: emp as Employee,
    checklist: (checkRes.data ?? []) as OnboardingChecklistItem[],
    documents: (docRes.data ?? []) as OnboardingDocument[],
  };
}
