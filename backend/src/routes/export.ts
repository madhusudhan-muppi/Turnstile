import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const exportRouter = Router();

function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

exportRouter.get(
  "/events/:id/export.csv",
  requireAuth,
  requireRole("organizer"),
  (req, res) => {
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id) as
      | { id: string; name: string; organizer_id: string }
      | undefined;
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.organizer_id !== req.user!.id) {
      return res.status(403).json({ error: "You do not organize this event" });
    }

    const rows = db
      .prepare(
        `SELECT u.name as attendee_name, u.email as attendee_email, r.status,
                r.checked_in_at, r.checked_in_station, r.created_at as registered_at
         FROM registrations r
         JOIN users u ON u.id = r.user_id
         WHERE r.event_id = ?
         ORDER BY r.created_at ASC`
      )
      .all(req.params.id) as Array<{
      attendee_name: string;
      attendee_email: string;
      status: string;
      checked_in_at: string | null;
      checked_in_station: string | null;
      registered_at: string;
    }>;

    const header = [
      "Name",
      "Email",
      "Status",
      "Registered At",
      "Checked In At",
      "Check-in Station",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvField(r.attendee_name),
          csvField(r.attendee_email),
          csvField(r.status),
          csvField(r.registered_at),
          csvField(r.checked_in_at),
          csvField(r.checked_in_station),
        ].join(",")
      );
    }

    const filename = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attendees.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\n"));
  }
);
