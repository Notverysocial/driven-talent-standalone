import type { ReactNode } from "react";

export function ChartCard({
  title,
  sub,
  action,
  goldEdge = true,
  children,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  goldEdge?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={"dt-card" + (goldEdge ? " gold-edge" : "")}>
      <div className="dt-card-head">
        <div>
          <h3>{title}</h3>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: "18px 22px 22px" }}>{children}</div>
    </div>
  );
}
