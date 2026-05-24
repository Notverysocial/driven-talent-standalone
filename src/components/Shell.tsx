import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BugReportButton } from "./BugReportButton";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dt-screen">
      <Sidebar />
      <div className="dt-main">{children}</div>
      <BugReportButton />
    </div>
  );
}
