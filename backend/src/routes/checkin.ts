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

interface ProcessedCheckin {
  status: "checked_in" | "duplicate" | "invalid";
  message: string;
  attendeeName?: string;
  eventName?: string;
  checkedInAt?: string | null;
  checkedInByMe?: boolean;
}

/**
 * Shared core for both the live scan endpoint and the offline sync-batch endpoint.
 * The duplicate-prevention logic itself lives in db.checkinByToken (a single
 * conditional UPDATE) — this just decodes the QR and turns the outcome into a
 * response shape the scanner UI can show clearly, whether it arrived live or
 * was queued offline and is syncing late.
 */
function processCheckin(payload: string, organizerId: string, station: string | null): ProcessedCheckin {
  const decoded = decodeQrPayload(payload);
  if (!decoded) {
    return { status: "invalid", message: "This does not look like a Turnstile QR code" };
  }

  const result = checkinByToken(decoded.qrToken, organizerId, station);

  if (result.outcome === "not_found") {
    return { status: "invalid", message: "QR code not recognized (wrong event, or never registered)" };
  }

  const reg = result.registration!;

  if (result.outcome === "duplicate") {
    const who = attendeeName(reg.userId);
    const when = reg.checkedInAt
      ? new Date(reg.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "an earlier scan";
    return {
      status: "duplicate",
      message: `${who} is already checked in (at ${when})`,
      attendeeName: who,
      checkedInAt: reg.checkedInAt,
      checkedInByMe: reg.checkedInBy === organizerId,
    };
  }

  const attendee = { registrationId: reg.id, name: attendeeName(reg.userId), checkedInAt: reg.checkedInAt! };
  broadcastCheckin(reg.eventId, attendee);

  return {
    status: "checked_in",
    message: `${attendee.name} checked in`,
    attendeeName: attendee.name,
    eventName: eventName(reg.eventId),
    checkedInAt: attendee.checkedInAt,
  };
}

/** Scan-to-check-in. Organizer-only. Body: { payload, station? }. */
checkinRouter.post("/checkin", requireAuth, requireRole("organizer"), (req, res) => {
  const { payload, station } = req.body ?? {};
  if (!payload || typeof payload !== "string") {
    return res.status(400).json({ error: "payload is required" });
  }

  const result = processCheckin(payload, req.user!.id, station ?? null);

  if (result.status === "invalid") return res.status(404).json({ error: result.message });
  if (result.status === "duplicate") {
    return res.status(409).json({ error: result.message, code: "ALREADY_CHECKED_IN", checkedInAt: result.checkedInAt });
  }
  res.json({
    success: true,
    attendeeName: result.attendeeName,
    eventName: result.eventName,
    checkedInAt: result.checkedInAt,
  });
});

/**
 * Syncs a batch of scans a scanner device queued while offline. Body:
 * { station?, scans: [{ clientScanId, payload, scannedAt }] }.
 *
 * Each item runs through the exact same atomic checkinByToken as a live scan, so
 * whichever scan (from any station, online or now-syncing) actually reached the
 * server first server-side wins — server receipt order is the tiebreaker, not the
 * client's local `scannedAt`, since an offline client's clock/timeline can't be
 * trusted to arbitrate against a station that was online the whole time. Every
 * item gets a definite per-scan result (checked_in / duplicate / invalid) keyed by
 * clientScanId, so the scanner can reconcile its local queue instead of silently
 * dropping or re-showing a scan as pending forever.
 */
checkinRouter.post("/checkin/sync-batch", requireAuth, requireRole("organizer"), (req, res) => {
  const { station, scans } = req.body ?? {};
  if (!Array.isArray(scans)) {
    return res.status(400).json({ error: "scans must be an array" });
  }

  const results = scans.map((scan: { clientScanId?: string; payload?: string }) => {
    if (!scan?.payload || typeof scan.payload !== "string") {
      return { clientScanId: scan?.clientScanId, status: "invalid", message: "Missing payload" };
    }
    const outcome = processCheckin(scan.payload, req.user!.id, station ?? null);
    return { clientScanId: scan.clientScanId, ...outcome };
  });

  res.json({ results });
});
