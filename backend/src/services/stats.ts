import { db } from "../db/index.js";

export interface EventStats {
  eventName: string;
  eventDate: string;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  noShowCount: number;
  noShowPercent: number;
  spotsLeft: number;
  peakCheckinMinute: string | null;
  peakCheckinCount: number;
  checkinsByMinute: Array<{ minute: string; count: number }>;
}

/**
 * Computes every number the AI insights feature is allowed to talk about.
 * This is the single source of truth: the AI only ever gets to phrase what's
 * already been computed here, never to guess at the underlying numbers.
 */
export function computeEventStats(eventId: string): EventStats | null {
  const event = db
    .prepare("SELECT name, event_date, capacity FROM events WHERE id = ?")
    .get(eventId) as { name: string; event_date: string; capacity: number } | undefined;
  if (!event) return null;

  const { registered, checked_in } = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'cancelled') as registered,
         COUNT(*) FILTER (WHERE status = 'checked_in') as checked_in
       FROM registrations WHERE event_id = ?`
    )
    .get(eventId) as { registered: number; checked_in: number };

  const noShowCount = registered - checked_in;
  const noShowPercent = registered > 0 ? Math.round((noShowCount / registered) * 1000) / 10 : 0;

  const checkinTimes = db
    .prepare(
      "SELECT checked_in_at FROM registrations WHERE event_id = ? AND status = 'checked_in' ORDER BY checked_in_at ASC"
    )
    .all(eventId) as Array<{ checked_in_at: string }>;

  const byMinute = new Map<string, number>();
  for (const { checked_in_at } of checkinTimes) {
    const minute = checked_in_at.slice(0, 16); // "YYYY-MM-DDTHH:MM"
    byMinute.set(minute, (byMinute.get(minute) ?? 0) + 1);
  }

  let peakCheckinMinute: string | null = null;
  let peakCheckinCount = 0;
  for (const [minute, count] of byMinute) {
    if (count > peakCheckinCount) {
      peakCheckinCount = count;
      peakCheckinMinute = minute;
    }
  }

  return {
    eventName: event.name,
    eventDate: event.event_date,
    capacity: event.capacity,
    registeredCount: registered,
    checkedInCount: checked_in,
    noShowCount,
    noShowPercent,
    spotsLeft: event.capacity - registered,
    peakCheckinMinute,
    peakCheckinCount,
    checkinsByMinute: Array.from(byMinute.entries()).map(([minute, count]) => ({ minute, count })),
  };
}
