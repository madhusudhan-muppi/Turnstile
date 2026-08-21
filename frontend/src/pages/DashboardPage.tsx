import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, getToken } from "../lib/api";
import { getSocket } from "../lib/socket";
import { InsightsBox } from "../components/InsightsBox";
import { AppShell } from "../components/layout/AppShell";
import { StatCard } from "../ui/StatCard";
import { MaterialIcon } from "../ui/MaterialIcon";

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

  if (error) return <AppShell><p className="font-body-md text-body-md text-error">{error}</p></AppShell>;
  if (!event) return <AppShell><p className="font-body-lg text-body-lg text-on-surface-variant">Loading dashboard…</p></AppShell>;

  const checkedInPercent = event.registeredCount > 0 ? (event.checkedInCount / event.registeredCount) * 100 : 0;

  return (
    <AppShell>
      <div className="flex flex-col gap-space-lg max-w-[1140px] mx-auto w-full">
        <section className="flex flex-col gap-space-md">
          <div className="flex justify-between items-end flex-wrap gap-space-md">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-surface">{event.name}</h1>
              <div className="flex items-center gap-space-sm font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mt-unit">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-secondary-fixed animate-pulse" : "bg-error"}`} />
                {connected ? "Live Telemetry Active" : "Reconnecting…"}
              </div>
              <div className="font-body-md text-body-md text-on-surface-variant mt-unit">
                {new Date(event.date).toLocaleString()}
              </div>
            </div>
            <button
              className="bg-primary text-on-primary px-space-md py-space-sm font-label-md text-label-md flex items-center gap-space-sm hover:bg-primary-container transition-colors shadow-sm"
              onClick={exportCsv}
            >
              <MaterialIcon name="download" className="text-[18px]" />
              EXPORT CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-sm">
            <StatCard label="Registered" value={`${event.registeredCount}/${event.capacity}`} icon="group" accent="primary" />
            <StatCard
              label="Checked In"
              value={event.checkedInCount}
              icon="check_circle"
              accent="secondary"
              progressPercent={checkedInPercent}
            />
            <StatCard label="Spots Left" value={event.spotsLeft} icon="pending" accent="error" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          <div className="lg:col-span-1">
            <InsightsBox eventId={event.id} />
          </div>

          <div className="lg:col-span-2 flex flex-col">
            <section className="bg-surface-container shadow-sm flex-1 flex flex-col overflow-hidden min-h-[400px]">
              <div className="p-space-md border-b border-surface flex justify-between items-center bg-surface-container-high">
                <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-space-sm">
                  <MaterialIcon name="radar" />
                  Live Scan Stream
                </h2>
              </div>
              <div className="grid grid-cols-12 gap-space-sm px-space-md py-space-sm bg-surface-container font-label-md text-label-md text-on-surface-variant border-b border-surface">
                <div className="col-span-4">TIMESTAMP</div>
                <div className="col-span-6">ATTENDEE</div>
                <div className="col-span-2 text-right">STATUS</div>
              </div>
              <div className="flex-1 overflow-y-auto bg-surface">
                {liveFeed.length === 0 && (
                  <p className="p-space-md font-body-md text-body-md text-on-surface-variant">
                    Waiting for check-ins…
                  </p>
                )}
                {liveFeed.map((c) => (
                  <div
                    key={c.registrationId}
                    className="grid grid-cols-12 gap-space-sm px-space-md py-space-sm border-b border-surface-container items-center hover:bg-surface-container-lowest transition-colors font-code-md text-code-md text-on-surface"
                  >
                    <div className="col-span-4 text-on-surface-variant">{new Date(c.checkedInAt).toLocaleTimeString()}</div>
                    <div className="col-span-6 flex items-center gap-space-sm truncate">
                      <div className="w-6 h-6 bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                        <MaterialIcon name="person" className="text-[14px]" />
                      </div>
                      {c.name}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <span className="bg-secondary text-on-secondary px-space-sm py-unit font-label-md text-label-md">VALID</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-space-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-space-md">Attendees</h2>
          <ul className="flex flex-col divide-y divide-outline-variant max-h-[420px] overflow-y-auto">
            {registrations.map((r) => (
              <li key={r.id} className="flex justify-between items-center py-space-sm font-body-md text-body-md">
                <span className="text-on-surface">
                  {r.attendee_name} <span className="text-on-surface-variant">({r.attendee_email})</span>
                </span>
                {r.status === "checked_in" ? (
                  <span className="text-on-surface-variant font-code-md text-code-md">
                    {r.checked_in_at && new Date(r.checked_in_at).toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="text-on-surface-variant">not checked in</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
