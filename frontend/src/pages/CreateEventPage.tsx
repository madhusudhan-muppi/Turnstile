import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";

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
    <div>
      <h1>Create event</h1>
      <form className="card" onSubmit={onSubmit}>
        <label>
          Event name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Date &amp; time
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min={1}
            required
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}
