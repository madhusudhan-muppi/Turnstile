import type { ReactNode } from "react";
import { MaterialIcon } from "./MaterialIcon";

export function StatCard({
  label,
  value,
  icon,
  accent,
  progressPercent,
}: {
  label: string;
  value: ReactNode;
  icon: string;
  accent: "primary" | "secondary" | "error";
  progressPercent?: number;
}) {
  const borderColor = { primary: "border-primary", secondary: "border-secondary", error: "border-error" }[accent];
  const barColor = { primary: "bg-primary", secondary: "bg-secondary", error: "bg-error" }[accent];
  const textColor = { primary: "text-primary", secondary: "text-secondary", error: "text-error" }[accent];

  return (
    <div className={`bg-surface-container shadow-sm p-space-md border-l-4 ${borderColor}`}>
      <div className="font-code-md text-code-md text-on-surface-variant uppercase mb-space-sm flex justify-between">
        <span>{label}</span>
        <MaterialIcon name={icon} className="text-[16px]" />
      </div>
      <div className="font-display-lg text-display-lg text-on-surface">{value}</div>
      {progressPercent !== undefined && (
        <>
          <div className="mt-space-sm h-1 w-full bg-surface">
            <div
              className={`h-full ${barColor} transition-all duration-1000 ease-in-out`}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
          <div className={`font-label-md text-label-md mt-unit text-right ${textColor}`}>
            {progressPercent.toFixed(1)}%
          </div>
        </>
      )}
    </div>
  );
}
