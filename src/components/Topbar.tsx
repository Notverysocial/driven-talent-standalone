import type { ReactNode } from "react";

export function Topbar({
  crumb,
  title,
  scriptWord,
  actions,
}: {
  crumb: string;
  title: string;
  scriptWord?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="dt-topbar">
      <div>
        <div className="crumb">{crumb}</div>
        <h1>
          {scriptWord && <em>{scriptWord}</em>}
          {title}
        </h1>
      </div>
      {actions && <div className="dt-topbar-right">{actions}</div>}
    </div>
  );
}
