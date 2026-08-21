import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { db } from "./db/index.js";

let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || "*" },
  });

  io.on("connection", (socket: Socket) => {
    socket.on("join-event", (eventId: string) => {
      socket.join(`event:${eventId}`);
    });
    socket.on("leave-event", (eventId: string) => {
      socket.leave(`event:${eventId}`);
    });
  });

  return io;
}

function currentCounts(eventId: string) {
  const event = db.prepare("SELECT capacity FROM events WHERE id = ?").get(eventId) as
    | { capacity: number }
    | undefined;
  if (!event) return null;

  const { registered, checked_in } = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'cancelled') as registered,
         COUNT(*) FILTER (WHERE status = 'checked_in') as checked_in
       FROM registrations WHERE event_id = ?`
    )
    .get(eventId) as { registered: number; checked_in: number };

  return {
    registeredCount: registered,
    checkedInCount: checked_in,
    spotsLeft: event.capacity - registered,
  };
}

/** Push fresh registration/capacity counts to everyone watching this event's dashboard. */
export function broadcastEventUpdate(eventId: string) {
  if (!io) return;
  const counts = currentCounts(eventId);
  if (!counts) return;
  io.to(`event:${eventId}`).emit("event:update", { eventId, ...counts });
}

/** Push a single check-in as it happens, so the dashboard can append to the live list. */
export function broadcastCheckin(
  eventId: string,
  attendee: { registrationId: string; name: string; checkedInAt: string }
) {
  if (!io) return;
  io.to(`event:${eventId}`).emit("event:checkin", { eventId, ...attendee });
  broadcastEventUpdate(eventId);
}
