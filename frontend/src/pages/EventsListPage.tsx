import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/layout/AppShell";
import { PlaceholderArt } from "../ui/PlaceholderArt";
import { MaterialIcon } from "../ui/MaterialIcon";

interface EventSummary {
  id: string;
  name: string;
  date: string;
  capacity: number;
  organizerId: string;
  registeredCount: number;
  checkedInCount: number;
  spotsLeft: number;
}

function statusOf(ev: EventSummary): "open" | "almost-full" | "sold-out" {
  if (ev.spotsLeft <= 0) return "sold-out";
  if (ev.registeredCount / ev.capacity >= 0.9) return "almost-full";
  return "open";
}

export function EventsListPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function load() {
    api
      .get<{ events: EventSummary[] }>("/api/events")
      .then((res) => setEvents(res.events))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load events"));
  }

  useEffect(load, []);

  async function register(eventId: string) {
    setRegisteringId(eventId);
    setMessage(null);
    setError(null);
    try {
      await api.post(`/api/events/${eventId}/register`, undefined);
      setMessage("You're registered! Find your QR code under \"My tickets\".");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setRegisteringId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!events) return events;
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => ev.name.toLowerCase().includes(q));
  }, [events, search]);

  return (
    <AppShell headerSearch={{ value: search, onChange: setSearch, placeholder: "Search events…" }}>
      <div className="flex flex-col gap-space-sm w-full pt-space-xl">
        <h1 className="font-display-lg text-display-lg text-on-surface">Explore Events</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Discover and register for upcoming events. Spots fill up quickly, so reserve your place in advance.
        </p>
        {user?.role === "organizer" && (
          <Link to="/events/new" className="w-fit">
            <button className="mt-space-sm bg-primary text-on-primary font-label-md text-label-md px-space-md h-12 flex items-center gap-space-xs uppercase tracking-wider hover:bg-primary-container transition-colors">
              <MaterialIcon name="add_box" className="text-[18px]" />
              Create event
            </button>
          </Link>
        )}
      </div>

      {message && (
        <p className="bg-secondary-container text-on-secondary-container font-label-md text-label-md px-space-md py-space-sm w-fit">
          {message}
        </p>
      )}
      {error && <p className="font-body-md text-body-md text-error">{error}</p>}
      {events === null && !error && <p className="font-body-lg text-body-lg text-on-surface-variant">Loading events…</p>}
      {filtered?.length === 0 && (
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {events?.length === 0 ? "No events yet." : "No events match your search."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg w-full">
        {filtered?.map((ev) => {
          const status = statusOf(ev);
          const percent = Math.min(100, (ev.registeredCount / ev.capacity) * 100);
          return (
            <div
              key={ev.id}
              className={`group flex flex-col transition-transform duration-200 ${
                status === "sold-out"
                  ? "bg-surface-container-low border border-outline-variant opacity-75"
                  : "bg-surface border border-outline hover:-translate-y-1"
              }`}
            >
              <div className="relative w-full h-40 border-b border-outline overflow-hidden">
                <PlaceholderArt icon="event" />
                <div
                  className={`absolute top-space-sm right-space-sm font-label-md text-label-md px-space-sm py-space-xs uppercase tracking-wider ${
                    status === "open"
                      ? "bg-secondary text-on-secondary"
                      : status === "almost-full"
                        ? "bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container"
                        : "bg-error text-on-error"
                  }`}
                >
                  {status === "open" ? "Registration Open" : status === "almost-full" ? "Almost Full" : "Sold Out"}
                </div>
              </div>
              <div className="p-space-md flex flex-col flex-1 gap-space-md">
                <div className="flex flex-col gap-space-xs">
                  <div className="font-label-md text-label-md text-primary-fixed-dim uppercase tracking-wider flex items-center gap-space-xs">
                    <MaterialIcon name="calendar_today" className="text-[16px]" />
                    {new Date(ev.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <h2 className="font-title-md text-title-md text-on-surface line-clamp-2 leading-snug">{ev.name}</h2>
                </div>
                <div className="mt-auto pt-space-md border-t border-outline flex flex-col gap-space-md">
                  <div className="flex justify-between items-center w-full">
                    <div className="font-code-md text-code-md text-on-surface-variant">Capacity</div>
                    <div className="font-code-md text-code-md text-on-surface">
                      {ev.registeredCount}/{ev.capacity} filled
                    </div>
                  </div>
                  <div className="w-full h-2 bg-surface-container border border-outline relative">
                    <div
                      className={`absolute left-0 top-0 bottom-0 ${
                        status === "open" ? "bg-secondary" : status === "almost-full" ? "bg-tertiary" : "bg-error"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {user?.role === "attendee" && (
                    <button
                      disabled={status === "sold-out" || registeringId === ev.id}
                      onClick={() => register(ev.id)}
                      className="w-full bg-primary text-on-primary font-label-md text-label-md h-12 uppercase tracking-[0.1em] hover:bg-on-surface transition-colors disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:cursor-not-allowed"
                    >
                      {status === "sold-out" ? "Registration Closed" : registeringId === ev.id ? "Registering…" : "Register Now"}
                    </button>
                  )}
                  {user?.role === "organizer" && ev.organizerId === user.id && (
                    <Link to={`/events/${ev.id}/dashboard`}>
                      <button className="w-full bg-primary-container text-on-primary-container font-label-md text-label-md h-12 uppercase tracking-[0.1em] hover:bg-on-surface hover:text-surface transition-colors">
                        Dashboard
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
