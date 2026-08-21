import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { MaterialIcon } from "../ui/MaterialIcon";

export function AuthPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<"login" | "signup">(location.pathname === "/signup" ? "signup" : "login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("organizer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await signup(email, password, name, role);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="w-full flex min-h-screen items-center justify-center p-margin-mobile bg-surface-container-low">
      <div className="w-full max-w-[400px] flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-xs text-center mb-space-sm">
          <div className="flex items-center justify-center gap-space-xs text-primary mb-space-xs">
            <MaterialIcon name="trip_origin" className="text-[32px] font-bold" />
            <h1 className="font-display-lg text-display-lg text-on-background tracking-tighter">Turnstile</h1>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">Event check-in system.</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-space-md flex flex-col gap-space-md relative">
          <div className="flex w-full border-b border-outline-variant pb-space-xs gap-space-md">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`font-label-md text-label-md uppercase pb-unit relative transition-colors ${
                tab === "login" ? "text-primary" : "text-on-surface-variant hover:text-primary"
              }`}
            >
              Sign In
              <div className={`absolute bottom-[-5px] left-0 right-0 h-[2px] bg-primary transition-opacity ${tab === "login" ? "opacity-100" : "opacity-0"}`} />
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`font-label-md text-label-md uppercase pb-unit relative transition-colors ${
                tab === "signup" ? "text-primary" : "text-on-surface-variant hover:text-primary"
              }`}
            >
              Register
              <div className={`absolute bottom-[-5px] left-0 right-0 h-[2px] bg-primary transition-opacity ${tab === "signup" ? "opacity-100" : "opacity-0"}`} />
            </button>
          </div>

          <form className="flex flex-col gap-space-sm" onSubmit={onSubmit}>
            {tab === "signup" && (
              <div className="flex flex-col gap-unit mb-space-xs">
                <label className="font-label-md text-label-md text-on-surface uppercase">Account Type</label>
                <div className="flex gap-space-xs">
                  {(["organizer", "attendee"] as const).map((r) => (
                    <label
                      key={r}
                      className={`flex-1 border p-space-sm flex items-center justify-center gap-space-xs cursor-pointer transition-colors ${
                        role === r ? "border-primary bg-primary-fixed" : "border-outline-variant bg-surface hover:border-primary"
                      }`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                      />
                      <MaterialIcon
                        name={r === "organizer" ? "admin_panel_settings" : "confirmation_number"}
                        className={`text-[16px] ${role === r ? "text-primary" : "text-on-surface-variant"}`}
                      />
                      <span className={`font-label-md text-label-md uppercase ${role === r ? "text-on-surface" : "text-on-surface-variant"}`}>
                        {r === "organizer" ? "Organizer" : "Attendee"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tab === "signup" && (
              <div className="flex flex-col gap-unit">
                <label className="font-label-md text-label-md text-on-surface uppercase">Name</label>
                <input
                  className="w-full bg-surface border border-outline-variant p-space-sm font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-unit">
              <label className="font-label-md text-label-md text-on-surface uppercase">Email address</label>
              <input
                className="w-full bg-surface border border-outline-variant p-space-sm font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
                type="email"
                required
                placeholder="operator@turnstile.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-unit">
              <label className="font-label-md text-label-md text-on-surface uppercase">Password</label>
              <input
                className="w-full bg-surface border border-outline-variant p-space-sm font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
                type="password"
                required
                minLength={tab === "signup" ? 6 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="font-body-md text-body-md text-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-space-xs w-full bg-primary text-on-primary font-title-md text-title-md py-space-sm hover:bg-primary-container transition-colors flex items-center justify-center gap-space-xs group disabled:opacity-60"
            >
              <span>{submitting ? "Please wait…" : tab === "login" ? "Authenticate" : "Initialize Identity"}</span>
              <MaterialIcon
                name={tab === "login" ? "arrow_forward" : "person_add"}
                className="text-[18px] transition-transform group-hover:translate-x-1"
              />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
