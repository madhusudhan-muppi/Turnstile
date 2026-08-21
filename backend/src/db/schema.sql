CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('organizer','attendee')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0),
  organizer_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registrations. `qr_token` is the one-time-use secret encoded into the attendee's QR code.
-- The UNIQUE(event_id, user_id) constraint stops the same person double-registering for an event.
-- Check-in duplication is prevented at the DB level by a conditional UPDATE against `status`
-- (see checkinRegistration in db/index.ts) rather than any in-process lock.
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  qr_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','checked_in','cancelled')),
  checked_in_at TEXT,
  checked_in_by TEXT REFERENCES users(id),
  checked_in_station TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_qr_token ON registrations(qr_token);
