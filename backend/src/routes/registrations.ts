import { Router } from "express";
import { db, registerForEvent, ConflictError } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { generateQrToken, encodeQrPayload, qrToDataUrl } from "../services/qr.js";
import { broadcastEventUpdate } from "../realtime.js";

export const registrationsRouter = Router();

interface RegistrationRow {
  id: string;
  event_id: string;
  user_id: string;
  qr_token: string;
  status: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  created_at: string;
}

async function serialize(reg: RegistrationRow, includeQr: boolean) {
  const event = db.prepare("SELECT name, event_date FROM events WHERE id = ?").get(reg.event_id) as
    | { name: string; event_date: string }
    | undefined;

  return {
    id: reg.id,
    eventId: reg.event_id,
    eventName: event?.name,
    eventDate: event?.event_date,
    status: reg.status,
    checkedInAt: reg.checked_in_at,
    createdAt: reg.created_at,
    qrDataUrl: includeQr && reg.status === "registered"
      ? await qrToDataUrl(encodeQrPayload(reg.id, reg.qr_token))
      : null,
    qrPayload: includeQr && reg.status === "registered"
      ? encodeQrPayload(reg.id, reg.qr_token)
      : null,
  };
}

registrationsRouter.post(
  "/events/:eventId/register",
  requireAuth,
  requireRole("attendee"),
  (req, res) => {
    const qrToken = generateQrToken();
    try {
      const { registrationId } = registerForEvent(req.params.eventId, req.user!.id, qrToken);
      broadcastEventUpdate(req.params.eventId);
      res.status(201).json({ registrationId });
    } catch (err) {
      if (err instanceof ConflictError) {
        const status = err.code === "EVENT_NOT_FOUND" ? 404 : 409;
        return res.status(status).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }
);

registrationsRouter.get("/registrations/mine", requireAuth, requireRole("attendee"), async (req, res) => {
  const rows = db
    .prepare("SELECT * FROM registrations WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id) as RegistrationRow[];

  const registrations = await Promise.all(rows.map((r) => serialize(r, true)));
  res.json({ registrations });
});

registrationsRouter.get("/registrations/:id", requireAuth, async (req, res) => {
  const reg = db.prepare("SELECT * FROM registrations WHERE id = ?").get(req.params.id) as
    | RegistrationRow
    | undefined;
  if (!reg) return res.status(404).json({ error: "Registration not found" });

  const event = db.prepare("SELECT organizer_id FROM events WHERE id = ?").get(reg.event_id) as
    | { organizer_id: string }
    | undefined;

  const isOwner = reg.user_id === req.user!.id;
  const isOrganizer = event?.organizer_id === req.user!.id;
  if (!isOwner && !isOrganizer) {
    return res.status(403).json({ error: "Not your registration" });
  }

  res.json({ registration: await serialize(reg, isOwner) });
});
