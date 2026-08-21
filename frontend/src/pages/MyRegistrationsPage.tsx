import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface Registration {
  id: string;
  eventName: string;
  eventDate: string;
  status: "registered" | "checked_in" | "cancelled";
  checkedInAt: string | null;
  qrDataUrl: string | null;
}

function StatusBadge({ status }: { status: Registration["status"] }) {
  if (status === "checked_in") return <span className="badge success">Checked in</span>;
  if (status === "cancelled") return <span className="badge muted">Cancelled</span>;
  return <span className="badge warning">Not checked in yet</span>;
}

export function MyRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ registrations: Registration[] }>("/api/registrations/mine")
      .then((res) => setRegistrations(res.registrations))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tickets"));
  }, []);

  return (
    <div>
      <h1>My tickets</h1>
      {error && <p className="error-text">{error}</p>}
      {registrations === null && !error && <p className="page-status">Loading…</p>}
      {registrations?.length === 0 && (
        <p className="page-status">You haven't registered for anything yet.</p>
      )}

      <div className="event-grid">
        {registrations?.map((r) => (
          <div className="event-card" key={r.id}>
            <h3>{r.eventName}</h3>
            <span className="date">{r.eventDate ? new Date(r.eventDate).toLocaleString() : ""}</span>
            <StatusBadge status={r.status} />
            {r.status === "checked_in" && r.checkedInAt && (
              <p className="muted">Checked in at {new Date(r.checkedInAt).toLocaleTimeString()}</p>
            )}
            {r.qrDataUrl && (
              <div className="qr-box">
                <img src={r.qrDataUrl} alt="Your check-in QR code" width={200} height={200} />
                <p className="muted">
                  Show this at the door. It's yours alone — screenshots stop working the moment
                  it's scanned once.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
