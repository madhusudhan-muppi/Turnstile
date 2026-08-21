import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, getToken } from "../lib/api";
import { getSocket } from "../lib/socket";
import { InsightsBox } from "../components/InsightsBox";

interface EventDetail {
  id: string;
  name: string;
  date: string;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  spotsLeft: number;
}

interface RegistrationRow {
  id: string;
  status: string;
  attendee_name: string;
  attendee_email: string;
  checked_in_at: string | null;
}

interface LiveCheckin {
  registrationId: string;
  name: string;
  checkedInAt: string;
}

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveCheckin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef(new Set<string>());

  function load() {
    if (!id) return;
    api
      .get<{ event: EventDetail; registrations: RegistrationRow[] }>(`/api/events/${id}/registrations`)
      .then((res) => {
        setEvent(res.event);
        setRegistrations(res.registrations);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit("join-event", id);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    setConnected(socket.connected);

    function onUpdate(payload: { eventId: string; registeredCount: number; checkedInCount: number; spotsLeft: number }) {
      if (payload.eventId !== id) return;
      setEvent((prev) => (prev ? { ...prev, ...payload } : prev));
    }

    function onCheckin(payload: LiveCheckin & { eventId: string }) {
      if (payload.eventId !== id) return;
      if (seenIds.current.has(payload.registrationId)) return;
      seenIds.current.add(payload.registrationId);
      setLiveFeed((prev) => [payload, ...prev].slice(0, 50));
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === payload.registrationId
            ? { ...r, status: "checked_in", checked_in_at: payload.checkedInAt }
            : r
        )
      );
    }

    socket.on("event:update", onUpdate);
    socket.on("event:checkin", onCheckin);

    return () => {
      socket.emit("leave-event", id);
      socket.off("event:update", onUpdate);
      socket.off("event:checkin", onCheckin);
    };
  }, [id]);

  async function exportCsv() {
    if (!id || !event) return;
    const res = await fetch(`/api/events/${id}/export.csv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setError("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attendees.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!event) return <p className="page-status">Loading dashboard…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>{event.name}</h1>
          <span className="muted">{new Date(event.date).toLocaleString()}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className={`pill ${connected ? "online" : "offline"}`}>
            {connected ? "● Live" : "○ Reconnecting…"}
          </span>
          <button className="secondary" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="value">{event.registeredCount}</div>
          <div className="label">Registered / {event.capacity} capacity</div>
        </div>
        <div className="stat-tile">
          <div className="value">{event.checkedInCount}</div>
          <div className="label">Checked in</div>
        </div>
        <div className="stat-tile">
          <div className="value">{event.spotsLeft}</div>
          <div className="label">Spots left</div>
        </div>
      </div>

      <InsightsBox eventId={event.id} />

      {liveFeed.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Just checked in</h2>
          <ul className="checkin-list">
            {liveFeed.map((c) => (
              <li key={c.registrationId}>
                <span>{c.name}</span>
                <time>{new Date(c.checkedInAt).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Attendees</h2>
        <ul className="checkin-list">
          {registrations.map((r) => (
            <li key={r.id}>
              <span>
                {r.attendee_name} <span className="muted">({r.attendee_email})</span>
              </span>
              {r.status === "checked_in" ? (
                <time>{r.checked_in_at && new Date(r.checked_in_at).toLocaleTimeString()}</time>
              ) : (
                <span className="muted">not checked in</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
