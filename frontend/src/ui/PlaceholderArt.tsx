import { MaterialIcon } from "./MaterialIcon";

/** CSS-only stand-in for the mockups' stock photography — no third-party image URLs. */
export function PlaceholderArt({ icon, className = "" }: { icon: string; className?: string }) {
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-container to-surface-container overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-outline-variant) 0, var(--color-outline-variant) 1px, transparent 1px, transparent 16px)",
        }}
      />
      <MaterialIcon name={icon} className="relative text-[40px] text-on-primary-container opacity-60" />
    </div>
  );
}
