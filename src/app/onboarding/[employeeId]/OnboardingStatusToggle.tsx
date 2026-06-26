"use client";

import { useTransition } from "react";
import type { EmployeeStatus } from "@/lib/supabase/types";
import { setEmployeeOnboardingStatus } from "../actions";

// Phase-1 #1 — manual Active toggle. Lets an operator mark a new hire Active
// while their onboarding checklist is still in progress (and flip back). The
// employee stays on the onboarding tracker until every relevant step is done.
export function OnboardingStatusToggle({
  employeeId,
  status,
  complete,
}: {
  employeeId: string;
  status: EmployeeStatus;
  complete: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  // Only meaningful for the onboarding ⇄ active pair. For terminated / inactive
  // employees the toggle is hidden by the parent.
  const isActive = status === "active";
  const target = isActive ? "onboarding" : "active";

  const flip = () => {
    startTransition(async () => {
      await setEmployeeOnboardingStatus(employeeId, target);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: 4,
          letterSpacing: "0.04em",
          background: isActive ? "#EAF1E0" : "var(--dt-gold-50)",
          color: isActive ? "var(--dt-success)" : "var(--dt-gold-deep)",
        }}
      >
        {isActive ? "Active" : "Onboarding"}
        {isActive && !complete ? " · onboarding in progress" : ""}
      </span>
      <button
        type="button"
        onClick={flip}
        disabled={isPending}
        className="dt-btn"
        style={{ fontSize: 11.5, padding: "5px 12px", opacity: isPending ? 0.6 : 1 }}
      >
        {isActive ? "↩ Back to Onboarding" : "✓ Mark Active"}
      </button>
    </div>
  );
}
