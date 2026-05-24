"use client";

import { useState } from "react";
import { recordPlacement } from "../actions";

type Lite = { id: string; full_name: string };

export function PlacementForm({
  positionId,
  candidates,
  employees,
}: {
  positionId: string;
  candidates: Lite[];
  employees: Lite[];
}) {
  const [source, setSource] = useState<"employee" | "candidate">("candidate");

  return (
    <form action={recordPlacement.bind(null, positionId)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => setSource("candidate")}
          className={"dt-btn" + (source === "candidate" ? " dt-btn-gold" : "")}
          style={{ fontSize: 11, padding: "4px 10px", flex: 1, justifyContent: "center" }}
        >
          <span>From Pipeline</span>
        </button>
        <button
          type="button"
          onClick={() => setSource("employee")}
          className={"dt-btn" + (source === "employee" ? " dt-btn-gold" : "")}
          style={{ fontSize: 11, padding: "4px 10px", flex: 1, justifyContent: "center" }}
        >
          <span>Existing Employee</span>
        </button>
      </div>

      {source === "candidate" ? (
        <select name="candidate_id" required defaultValue="" className="dt-filter-input" style={{ fontSize: 12 }}>
          <option value="" disabled>— Pick a candidate —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      ) : (
        <select name="employee_id" required defaultValue="" className="dt-filter-input" style={{ fontSize: 12 }}>
          <option value="" disabled>— Pick an employee —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      )}

      <input
        name="notes"
        placeholder="Optional notes"
        className="dt-filter-input"
        style={{ fontSize: 12 }}
      />

      <button type="submit" className="dt-btn dt-btn-gold" style={{ fontSize: 11.5, justifyContent: "center" }}>
        <span>Record Placement</span>
      </button>
    </form>
  );
}
