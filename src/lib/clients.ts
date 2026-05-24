// Shared helpers for the /clients margin module.
// No `server-only` import here — these utilities are pure formatters used
// from both server queries and client-side rendering.

export type MarginTone = "green" | "amber" | "red" | "warm";

// Margin tone bands tuned for staffing — anything below 15% is thin,
// below 8% is bleeding. >25% is a healthy book.
export function marginTone(pct: number | null): MarginTone {
  if (pct === null || Number.isNaN(pct)) return "warm";
  if (pct >= 25) return "green";
  if (pct >= 15) return "amber";
  return "red";
}

export function fmtPct(n: number | null, digits = 1): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmtUSD2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
