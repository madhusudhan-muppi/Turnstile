import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { AppShell } from "../components/layout/AppShell";
import { MaterialIcon } from "../ui/MaterialIcon";

interface Registration {
  id: string;
  eventName: string;
  eventDate: string;
  status: "registered" | "checked_in" | "cancelled";
  checkedInAt: string | null;
  qrDataUrl: string | null;
}

function StatusChip({ status }: { status: Registration["status"] }) {
  if (status === "checked_in") {
    return (
      <span className="inline-flex items-center gap-unit px-space-sm py-unit bg-secondary-container text-on-secondary-container font-label-md text-label-md rounded-full max-w-fit">
        <span className="w-2 h-2 rounded-full bg-secondary" />
        CHECKED IN
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-unit px-space-sm py-unit bg-surface-variant text-on-surface-variant font-label-md text-label-md rounded-full max-w-fit">
        CANCELLED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-unit px-space-sm py-unit bg-surface-variant text-primary font-label-md text-label-md rounded-full max-w-fit">
      <MaterialIcon name="calendar_month" className="text-[14px]" />
      NOT CHECKED IN YET
    </span>
  );
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
    <AppShell>
      <div className="flex flex-col gap-space-sm w-full max-w-2xl pt-space-xl">
        <div className="flex items-center gap-space-md text-on-surface-variant font-label-md tracking-[0.1em] uppercase">
          <span className="w-8 h-[1px] bg-primary" />
          Attendee Dashboard
        </div>
        <h1 className="font-display-lg text-display-lg text-primary tracking-tight">My Tickets</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
          Present the QR code at the door. Each one works once, for you alone.
        </p>
      </div>

      {error && <p className="font-body-md text-body-md text-error">{error}</p>}
      {registrations === null && !error && (
        <p className="font-body-lg text-body-lg text-on-surface-variant">Loading…</p>
      )}
      {registrations?.length === 0 && (
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          You haven't registered for anything yet.
        </p>
      )}

      <div className="flex flex-col gap-space-lg max-w-4xl">
        {registrations?.map((r) => (
          <div
            key={r.id}
            className="relative bg-surface-container-lowest rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col md:flex-row"
          >
            <div className="flex-1 p-space-lg flex flex-col justify-between gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <StatusChip status={r.status} />
                <h2 className="font-headline-lg text-headline-lg text-primary mt-space-sm">{r.eventName}</h2>
              </div>
              <div className="grid grid-cols-2 gap-space-md pt-space-md border-t border-outline-variant/30">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Date &amp; Time
                  </span>
                  <span className="font-title-md text-title-md text-on-surface">
                    {r.eventDate ? new Date(r.eventDate).toLocaleString() : "—"}
                  </span>
                </div>
                {r.status === "checked_in" && r.checkedInAt && (
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                      Checked In At
                    </span>
                    <span className="font-title-md text-title-md text-on-surface">
                      {new Date(r.checkedInAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {r.qrDataUrl && (
              <div className="w-full md:w-72 bg-surface-container flex flex-col items-center justify-center p-space-lg">
                <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm mb-space-md">
                  <img src={r.qrDataUrl} alt="Your check-in QR code" width={160} height={160} />
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant text-center">
                  Screenshots stop working the moment it's scanned once.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
