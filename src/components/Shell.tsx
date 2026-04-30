import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dt-screen">
      <Sidebar />
      <div className="dt-main">{children}</div>
    </div>
  );
}
