# Turnstile

A real-time event check-in system: organizers create events, attendees register and get a unique QR
code, organizers scan attendees in at the door, and a live dashboard shows who's checked in as it happens.

Built for the MIC Development Department recruitment task.

## Structure

- [backend/](backend/) — Node/Express + TypeScript API, SQLite (via `better-sqlite3`), Socket.io, Gemini-powered insights
- [frontend/](frontend/) — React + Vite + TypeScript client (organizer + attendee views)
- [scripts/](scripts/) — concurrency proof scripts (registration + check-in hammer tests)
- [docs/](docs/) — write-up covering the four hard requirements and design tradeoffs

More detail on setup, architecture, and the hard-requirement writeups will be filled in as each
part is built.
