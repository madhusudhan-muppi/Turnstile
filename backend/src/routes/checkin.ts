import { Router } from "express";
import { db, checkinByToken } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { decodeQrPayload } from "../services/qr.js";
import { broadcastCheckin } from "../realtime.js";

export const checkinRouter = Router();

function attendeeName(userId: string): string {
  const row = db.prepare("SELECT name FROM users WHERE id = ?").get(userId) as
    | { name: string }
    | undefined;
  return row?.name ?? "Unknown attendee";
}

function eventName(eventId: string): string {
  const row = db.prepare("SELECT name FROM events WHERE id = ?").get(eventId) as
    | { name: string }
    | undefined;
  return row?.name ?? "Unknown event";
}

/**
 * Scan-to-check-in. Organizer-only. Body: { payload, station? }.
 * `payload` is the raw string decoded off the QR (see services/qr.ts for the format).
 *
 * The actual duplicate-prevention logic lives in db.checkinByToken (a single
 * conditional UPDATE) — this route just decodes the QR, calls it, and turns the
 * three possible outcomes into a response the scanner UI can show clearly.
 */
checkinRouter.post("/checkin", requireAuth, requireRole("organizer"), (req, res) => {
  const { payload, station } = req.body ?? {};
  if (!payload || typeof payload !== "string") {
    return res.status(400).json({ error: "payload is required" });
  }

  const decoded = decodeQrPayload(payload);
  if (!decoded) {
    return res.status(400).json({ error: "This does not look like a Turnstile QR code" });
  }

  const result = checkinByToken(decoded.qrToken, req.user!.id, station ?? null);

  if (result.outcome === "not_found") {
    return res.status(404).json({ error: "QR code not recognized (wrong event, or never registered)" });
  }

  const reg = result.registration!;

  if (result.outcome === "duplicate") {
    const who = attendeeName(reg.userId);
    const when = reg.checkedInAt
      ? new Date(reg.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "an earlier scan";
    return res.status(409).json({
      error: `${who} is already checked in (at ${when})`,
      code: "ALREADY_CHECKED_IN",
      checkedInAt: reg.checkedInAt,
    });
  }

  const attendee = { registrationId: reg.id, name: attendeeName(reg.userId), checkedInAt: reg.checkedInAt! };
  broadcastCheckin(reg.eventId, attendee);

  res.json({
    success: true,
    attendeeName: attendee.name,
    eventName: eventName(reg.eventId),
    checkedInAt: attendee.checkedInAt,
  });
});
