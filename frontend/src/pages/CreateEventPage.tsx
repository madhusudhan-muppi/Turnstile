import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AppShell } from "../components/layout/AppShell";
import { MaterialIcon } from "../ui/MaterialIcon";

export function CreateEventPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ event: { id: string } }>("/api/events", {
        name,
        date: new Date(date).toISOString(),
        capacity,
      });
      navigate(`/events/${res.event.id}/dashboard`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col w-full h-full gap-space-lg max-w-4xl">
        <div className="flex flex-col gap-unit">
          <h1 className="font-display-lg text-display-lg text-on-surface">Create New Event</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Set up the event's parameters. Attendees will be able to register once it's live.
          </p>
        </div>

        <form
          className="flex flex-col gap-space-lg w-full bg-surface-container-lowest p-space-lg border border-outline-variant relative"
          onSubmit={onSubmit}
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg mt-space-md">
            <div className="flex flex-col gap-space-xs col-span-1 md:col-span-2">
              <label
                className="font-label-md text-label-md text-on-surface flex items-center gap-space-xs uppercase tracking-wider"
                htmlFor="eventName"
              >
                <MaterialIcon name="badge" className="text-[16px]" />
                Event Name
              </label>
              <input
                id="eventName"
                className="w-full bg-surface border border-outline text-on-surface font-body-lg text-body-lg px-space-md py-space-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="e.g., Q3 Tech Summit"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-space-xs">
              <label
                className="font-label-md text-label-md text-on-surface flex items-center gap-space-xs uppercase tracking-wider"
                htmlFor="eventDateTime"
              >
                <MaterialIcon name="schedule" className="text-[16px]" />
                Date &amp; Time
              </label>
              <input
                id="eventDateTime"
                type="datetime-local"
                className="w-full bg-surface border border-outline text-on-surface font-body-lg text-body-lg px-space-md py-space-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-space-xs">
              <label
                className="font-label-md text-label-md text-on-surface flex items-center gap-space-xs uppercase tracking-wider"
                htmlFor="eventCapacity"
              >
                <MaterialIcon name="groups" className="text-[16px]" />
                Capacity
              </label>
              <input
                id="eventCapacity"
                type="number"
                min={1}
                className="w-full bg-surface border border-outline text-on-surface font-body-lg text-body-lg px-space-md py-space-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </div>
          </div>

          {error && <p className="font-body-md text-body-md text-error">{error}</p>}

          <div className="border-t border-outline-variant mt-space-sm pt-space-md flex justify-end items-center gap-space-md">
            <button
              type="submit"
              disabled={submitting}
              className="px-space-lg py-space-sm font-label-md text-label-md bg-primary text-on-primary hover:bg-inverse-surface transition-colors flex items-center gap-space-sm uppercase tracking-widest group disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Event"}
              <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
