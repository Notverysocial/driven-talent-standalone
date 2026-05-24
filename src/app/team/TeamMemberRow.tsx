"use client";

import { useTransition } from "react";
import { Badge } from "@/components/Badge";
import {
  ROLE_LABEL,
  ROLE_TONE,
  TEAM_ROLES,
  fmtDate,
  type TeamMember,
  type TeamMemberRole,
} from "@/lib/team";
import {
  deleteTeamMember,
  setTeamMemberStatus,
  updateTeamMemberRole,
} from "./actions";

export function TeamMemberRow({ member }: { member: TeamMember }) {
  const [isPending, startTransition] = useTransition();
  const isActive = member.status === "active";

  const onRoleChange = (role: TeamMemberRole) => {
    startTransition(async () => {
      await updateTeamMemberRole(member.id, role);
    });
  };

  const onToggleStatus = () => {
    const next = isActive ? "inactive" : "active";
    if (isActive && !confirm(`Mark ${member.full_name} as inactive?`)) return;
    startTransition(async () => {
      await setTeamMemberStatus(member.id, next);
    });
  };

  const onDelete = () => {
    if (!confirm(`Permanently delete ${member.full_name}? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteTeamMember(member.id);
    });
  };

  const initials = member.initials ?? member.full_name.slice(0, 2).toUpperCase();
  const dateLabel = isActive ? member.start_date : member.end_date;

  return (
    <tr style={{ opacity: isPending ? 0.55 : 1, transition: "opacity 120ms" }}>
      <td style={{ paddingLeft: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--dt-warm-100)",
              color: "var(--dt-warm-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{member.full_name}</div>
            {!isActive && (
              <div className="muted" style={{ fontSize: 10.5 }}>inactive</div>
            )}
          </div>
        </div>
      </td>
      <td>
        {isActive ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(e.target.value as TeamMemberRole)}
            disabled={isPending}
            className="dt-filter-input"
            style={{ minWidth: 150, padding: "4px 8px", fontSize: 12 }}
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        ) : (
          <Badge tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
        )}
      </td>
      <td className="muted" style={{ fontSize: 12 }}>{member.title ?? "—"}</td>
      <td className="muted" style={{ fontSize: 12 }}>{member.email ?? "—"}</td>
      <td className="tab-num muted" style={{ fontSize: 12 }}>{member.phone ?? "—"}</td>
      <td className="tab-num" style={{ fontSize: 12 }}>{fmtDate(dateLabel)}</td>
      <td style={{ paddingRight: 22, textAlign: "right" }}>
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={isPending}
            className="dt-btn"
            style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
          >
            <span>{isActive ? "Deactivate" : "Reactivate"}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="dt-btn dt-btn-ghost"
            style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
          >
            <span>Delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
