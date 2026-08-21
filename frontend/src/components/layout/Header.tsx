import { MaterialIcon } from "../../ui/MaterialIcon";

export function Header({
  search,
}: {
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
}) {
  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-surface border-b border-outline-variant z-40 flex items-center justify-between px-margin-desktop">
      <div className="flex items-center gap-space-md">
        <MaterialIcon name="search" className="text-on-surface-variant" />
        <input
          className="bg-transparent border-none text-body-md outline-none w-64"
          placeholder={search?.placeholder ?? "Search…"}
          type="text"
          value={search?.value ?? ""}
          onChange={(e) => search?.onChange(e.target.value)}
          disabled={!search}
        />
      </div>
      <div className="flex items-center gap-space-lg">
        <div className="h-6 w-[1px] bg-outline-variant" />
        <span className="text-label-md tracking-wider text-on-surface-variant">SYSTEM: ONLINE</span>
      </div>
    </header>
  );
}
