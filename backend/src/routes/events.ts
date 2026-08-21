import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const eventsRouter = Router();

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  capacity: number;
  organizer_id: string;
  created_at: string;
}

function withCounts(event: EventRow) {
  const { registered, checked_in } = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'cancelled') as registered,
         COUNT(*) FILTER (WHERE status = 'checked_in') as checked_in
       FROM registrations WHERE event_id = ?`
    )
    .get(event.id) as { registered: number; checked_in: number };

  return {
    id: event.id,
    name: event.name,
    date: event.event_date,
    capacity: event.capacity,
    organizerId: event.organizer_id,
    createdAt: event.created_at,
    registeredCount: registered,
    checkedInCount: checked_in,
    spotsLeft: event.capacity - registered,
  };
}

// Any logged-in user can browse events (attendees need this to find something to register for).
eventsRouter.get("/", requireAuth, (_req, res) => {
  const events = db
    .prepare("SELECT * FROM events ORDER BY event_date ASC")
    .all() as EventRow[];
  res.json({ events: events.map(withCounts) });
});

eventsRouter.get("/:id", requireAuth, (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id) as
    | EventRow
    | undefined;
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json({ event: withCounts(event) });
});

eventsRouter.post("/", requireAuth, requireRole("organizer"), (req, res) => {
  const { name, date, capacity } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (!date || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ error: "date must be a valid date string" });
  }
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap <= 0) {
    return res.status(400).json({ error: "capacity must be a positive integer" });
  }

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO events (id, name, event_date, capacity, organizer_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, date, cap, req.user!.id);

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow;
  res.status(201).json({ event: withCounts(event) });
});

// Organizer-only: the full attendee list backing the dashboard and CSV export.
eventsRouter.get("/:id/registrations", requireAuth, requireRole("organizer"), (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id) as
    | EventRow
    | undefined;
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.organizer_id !== req.user!.id) {
    return res.status(403).json({ error: "You do not organize this event" });
  }

  const registrations = db
    .prepare(
      `SELECT r.id, r.status, r.checked_in_at, r.checked_in_by, r.created_at,
              u.name as attendee_name, u.email as attendee_email
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ?
       ORDER BY r.created_at ASC`
    )
    .all(req.params.id);

  res.json({ event: withCounts(event), registrations });
});
