import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

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

export function EventsListPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div>
      <div className="page-header">
        <h1>Events</h1>
        {user?.role === "organizer" && <Link to="/events/new"><button>Create event</button></Link>}
      </div>

      {message && <p className="badge success" style={{ marginBottom: "1rem" }}>{message}</p>}
      {error && <p className="error-text">{error}</p>}

      {events === null && !error && <p className="page-status">Loading events…</p>}
      {events?.length === 0 && <p className="page-status">No events yet.</p>}

      <div className="event-grid">
        {events?.map((ev) => (
          <div className="event-card" key={ev.id}>
            <h3>{ev.name}</h3>
            <span className="date">{new Date(ev.date).toLocaleString()}</span>
            <div className="stats">
              <span><strong>{ev.registeredCount}</strong>/{ev.capacity} registered</span>
              <span><strong>{ev.checkedInCount}</strong> checked in</span>
            </div>
            <div className="actions">
              {user?.role === "attendee" && (
                <button
                  disabled={ev.spotsLeft <= 0 || registeringId === ev.id}
                  onClick={() => register(ev.id)}
                >
                  {ev.spotsLeft <= 0 ? "Full" : registeringId === ev.id ? "Registering…" : "Register"}
                </button>
              )}
              {user?.role === "organizer" && ev.organizerId === user.id && (
                <Link to={`/events/${ev.id}/dashboard`}>
                  <button className="secondary">Dashboard</button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
