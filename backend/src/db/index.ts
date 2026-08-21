import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH || "./data/turnstile.db";
const resolvedPath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new DatabaseSync(resolvedPath);

// WAL mode lets multiple processes (e.g. two `npm run dev` instances on different
// ports, per the concurrency proof requirement) read/write the same file safely.
// busy_timeout makes a writer that loses the race to a lock retry briefly instead
// of throwing immediately, so bursts of concurrent requests queue instead of failing.
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA foreign_keys = ON;");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

export class ConflictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Registers a user for an event, enforcing capacity at the database level.
 *
 * Uses `BEGIN IMMEDIATE` to take SQLite's write lock up front (rather than on the
 * first write inside the transaction). Under WAL mode, only one writer — across the
 * whole OS, whether that's a thread in this process or a separate process on another
 * port — can hold that lock at a time, so "count existing registrations, compare to
 * capacity, insert if room" runs as one atomic unit. A second request that starts its
 * transaction while the first is still open blocks on the lock, then re-reads the
 * now-updated count once it acquires it. That's what makes this correct across
 * multiple server processes, not just multiple requests in one process — an
 * in-memory mutex/counter would only protect one process's requests.
 */
export function registerForEvent(
  eventId: string,
  userId: string,
  qrToken: string
): { registrationId: string } {
  db.exec("BEGIN IMMEDIATE");
  try {
    const event = db
      .prepare("SELECT capacity FROM events WHERE id = ?")
      .get(eventId) as { capacity: number } | undefined;

    if (!event) {
      throw new ConflictError("EVENT_NOT_FOUND", "Event not found");
    }

    const existing = db
      .prepare(
        "SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'"
      )
      .get(eventId, userId);
    if (existing) {
      throw new ConflictError(
        "ALREADY_REGISTERED",
        "You are already registered for this event"
      );
    }

    const { count } = db
      .prepare(
        "SELECT COUNT(*) as count FROM registrations WHERE event_id = ? AND status != 'cancelled'"
      )
      .get(eventId) as { count: number };

    if (count >= event.capacity) {
      throw new ConflictError("EVENT_FULL", "This event is at capacity");
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO registrations (id, event_id, user_id, qr_token, status)
       VALUES (?, ?, ?, ?, 'registered')`
    ).run(id, eventId, userId, qrToken);

    db.exec("COMMIT");
    return { registrationId: id };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export interface CheckinResult {
  outcome: "checked_in" | "duplicate" | "not_found";
  registration?: {
    id: string;
    eventId: string;
    userId: string;
    checkedInAt: string | null;
    checkedInBy: string | null;
  };
}

/**
 * Checks a registration in, preventing duplicates at the database level.
 *
 * The UPDATE's WHERE clause requires status = 'registered'. SQLite executes that
 * read-compare-write as a single atomic statement — there is no window between
 * checking the status and flipping it where a second scan (from this process or
 * another one hitting the same file) could sneak in. Whichever scan's UPDATE
 * statement is actually applied first by SQLite wins and flips the row; every
 * other concurrent attempt sees `changes === 0` and is reported as a duplicate.
 * No application-level lock/mutex is involved.
 */
export function checkinByToken(
  qrToken: string,
  checkedInBy: string,
  station: string | null
): CheckinResult {
  const reg = db
    .prepare(
      "SELECT id, event_id, user_id, status, checked_in_at, checked_in_by FROM registrations WHERE qr_token = ?"
    )
    .get(qrToken) as
    | {
        id: string;
        event_id: string;
        user_id: string;
        status: string;
        checked_in_at: string | null;
        checked_in_by: string | null;
      }
    | undefined;

  if (!reg) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE registrations
       SET status = 'checked_in', checked_in_at = ?, checked_in_by = ?, checked_in_station = ?
       WHERE qr_token = ? AND status = 'registered'`
    )
    .run(now, checkedInBy, station, qrToken);

  if (result.changes === 1) {
    return {
      outcome: "checked_in",
      registration: {
        id: reg.id,
        eventId: reg.event_id,
        userId: reg.user_id,
        checkedInAt: now,
        checkedInBy,
      },
    };
  }

  // Someone else's UPDATE won the race (or this token was already used earlier).
  // Re-read so we can tell the caller exactly when/who it happened for.
  const current = db
    .prepare(
      "SELECT id, event_id, user_id, checked_in_at, checked_in_by FROM registrations WHERE qr_token = ?"
    )
    .get(qrToken) as {
    id: string;
    event_id: string;
    user_id: string;
    checked_in_at: string | null;
    checked_in_by: string | null;
  };

  return {
    outcome: "duplicate",
    registration: {
      id: current.id,
      eventId: current.event_id,
      userId: current.user_id,
      checkedInAt: current.checked_in_at,
      checkedInBy: current.checked_in_by,
    },
  };
}
