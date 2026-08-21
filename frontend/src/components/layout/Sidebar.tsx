import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { MaterialIcon } from "../../ui/MaterialIcon";

const ORGANIZER_LINKS = [
  { to: "/", label: "Browse Events", icon: "explore" },
  { to: "/events/new", label: "Create Event", icon: "add_box" },
  { to: "/scan", label: "Scanner", icon: "qr_code_scanner" },
];

const ATTENDEE_LINKS = [
  { to: "/", label: "Browse Events", icon: "explore" },
  { to: "/mine", label: "My Tickets", icon: "confirmation_number" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const links = user?.role === "organizer" ? ORGANIZER_LINKS : ATTENDEE_LINKS;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-outline-variant z-50 flex flex-col">
      <div className="h-16 flex items-center px-space-lg bg-primary text-on-primary font-headline-md uppercase tracking-[0.2em]">
        Turnstile
      </div>
      <div className="p-space-md border-b border-outline-variant bg-surface-container-low">
        <div className="text-label-md text-on-surface-variant mb-unit">SIGNED IN AS</div>
        <div className="font-title-md text-title-md text-on-surface truncate">{user?.name}</div>
        <div className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          {user?.role}
        </div>
      </div>
      <nav className="flex-1 py-space-md flex flex-col gap-unit">
        {links.map((link) => {
          const active = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? "page" : undefined}
              className={`flex items-center px-space-lg py-space-sm transition-colors ${
                active
                  ? "bg-primary text-on-primary"
                  : "text-body-md text-on-surface-variant hover:bg-surface-container-highest"
              }`}
            >
              <MaterialIcon name={link.icon} className="mr-space-md text-[20px]" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-space-md border-t border-outline-variant flex items-center justify-between">
        <button
          className="flex items-center gap-space-sm font-label-md text-on-surface-variant hover:text-primary cursor-pointer bg-transparent border-none p-0"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <MaterialIcon name="logout" className="text-[20px]" />
          LOGOUT
        </button>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <MaterialIcon name="person" className="text-on-primary text-[18px]" />
        </div>
      </div>
    </aside>
  );
}
