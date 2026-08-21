import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({
  children,
  headerSearch,
  mainClassName = "pt-16 min-h-screen bg-surface",
}: {
  children: ReactNode;
  headerSearch?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** Each page owns its own inner layout/padding — the mockups differ page to page
   * (plain padded content vs. a full-bleed dark scanner view), so only the shared
   * pt-16 (clears the fixed header) and bg-surface default live here. */
  mainClassName?: string;
}) {
  return (
    <>
      <Sidebar />
      <div className="pl-64">
        <Header search={headerSearch} />
        <main className={mainClassName}>{children}</main>
      </div>
    </>
  );
}
