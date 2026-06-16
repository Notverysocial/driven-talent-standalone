"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { findRehireMatchesAction } from "./actions";
import type { RehireMatch } from "@/lib/talent-pool.server";

/**
 * "Review pool before posting externally" banner.
 *
 * The killer feature from the Seasonal Talent Pool spec: before a recruiter
 * spends money posting a role to an external board, check whether DT already
 * has vetted, available-for-rehire workers who match the role + location.
 *
 * Self-contained island: role + location inputs, a Check button that queries
 * the rehire pool, and a result banner that deep-links into /talent-pool.
 */
export function MatchingPoolBanner() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [matches, setMatches] = useState<RehireMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await findRehireMatchesAction({ role, location });
        setMatches(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed.");
      }
    });
  }

  const poolHref = (() => {
    const p = new URLSearchParams({ tab: "available_for_rehire" });
    const qparts = [role, location].map((s) => s.trim()).filter(Boolean);
    if (qparts.length) p.set("q", qparts.join(" "));
    return `/talent-pool?${p.toString()}`;
  })();

  return (
    <div
      className="dt-card"
      style={{
        marginBottom: 22,
        padding: "18px 22px",
        borderLeft: "3px solid var(--dt-gold)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
          marginBottom: 10,
        }}
      >
        Check the rehire pool first
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (e.g. Warehouse Associate)"
          className="dt-filter-input"
          style={{ flex: "1 1 220px" }}
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (e.g. Phoenix)"
          className="dt-filter-input"
          style={{ flex: "1 1 160px" }}
        />
        <button
          type="button"
          className="dt-btn dt-btn-gold"
          onClick={check}
          disabled={pending}
          style={{ cursor: pending ? "wait" : "pointer" }}
        >
          <span>{pending ? "Checking…" : "Find rehires"}</span>
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--dt-danger)" }}>
          {error}
        </div>
      )}

      {matches !== null && !error && (
        <div style={{ marginTop: 12 }}>
          {matches.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--dt-warm-600)" }}>
              No available-for-rehire candidates match yet. Posting externally
              is the right call.
            </div>
          ) : (
            <div
              style={{
                fontSize: 13.5,
                color: "var(--dt-black)",
                lineHeight: 1.5,
              }}
            >
              <strong>{matches.length}</strong> available{" "}
              {matches.length === 1 ? "candidate" : "candidates"} match the
              location and skills for this role.{" "}
              <Link
                href={poolHref}
                style={{ color: "var(--dt-gold-deep)", fontWeight: 600 }}
              >
                Review pool before posting externally →
              </Link>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--dt-warm-600)",
                }}
              >
                {matches
                  .slice(0, 5)
                  .map((m) => m.full_name)
                  .join(", ")}
                {matches.length > 5 ? `, +${matches.length - 5} more` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
