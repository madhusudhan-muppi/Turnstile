# Turnstile

A real-time event check-in system: organizers create events, attendees register and get a unique
QR code, organizers scan attendees in at the door, and a live dashboard shows who's checked in as
it happens.

Named after the physical device — a turnstile physically prevents the same ticket getting two
people through, which is the core problem this system is built to actually solve, not just look
like it solves.

Built for the MIC Development Department recruitment task.

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Database | SQLite, via Node's built-in `node:sqlite` module |
| Realtime | Socket.io |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| QR codes | `qrcode` (generation, server-side) + `html5-qrcode` (camera scanning, browser) |
| AI insights | Google Gemini 2.5 Flash-Lite (`@google/genai`), called server-side only |
| Frontend | React + TypeScript, Vite, React Router, `socket.io-client` |

**Why `node:sqlite` instead of `better-sqlite3`:** `better-sqlite3` needs a native build toolchain
(`g++`) that wasn't available in the dev environment. Node 22+ ships a built-in synchronous SQLite
driver (`node:sqlite`) with essentially the same API shape (prepared statements, transactions,
`.run()`/`.get()`/`.all()`), so it was a drop-in swap with zero extra dependencies. It's still a
single file on disk that multiple OS processes can open concurrently under WAL mode, which is what
the concurrency requirement actually needs.

## Running it

```bash
# Backend
cd backend
cp .env.example .env   # fill in GEMINI_API_KEY if you have one (optional — see below)
npm install
npm run dev             # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # http://localhost:5173, proxies /api and /socket.io to :4000
```

Sign up once as an **organizer** and once as an **attendee** (two different accounts/browsers, or
two browser profiles) to see both sides. Organizer: create an event → open its dashboard → open
`/scan` to check people in. Attendee: register from the home page → view your QR under "My
tickets".

Without a `GEMINI_API_KEY`, the AI insights box still works — it falls back to showing the raw
computed stats with a clear "AI unavailable" note, per the hard requirement's fallback rule.

## Concurrency proof

```bash
bash scripts/run-concurrency-proof.sh
```

This starts the backend **twice**, as two separate OS processes on ports 4001 and 4002, both
pointed at the same SQLite file — the actual multi-process scenario the task asks for, not a
simulation within one process. It then:

1. Fires 150 concurrent registration requests (split across both ports) at an event with
   capacity 50, and asserts exactly 50 succeed.
2. Fires 120 concurrent check-in requests (split across both ports) at the **same** QR code, and
   asserts exactly 1 succeeds.

A sample passing run is committed at
[scripts/proof-logs/sample-passing-run.log](scripts/proof-logs/sample-passing-run.log). Every run
also writes a timestamped log to `scripts/proof-logs/`.

## The four hard requirements

### 1. Preventing duplicate check-ins and over-capacity registration

Both guarantees are enforced by SQLite itself, not by anything in the Node process — see
[backend/src/db/index.ts](backend/src/db/index.ts).

- **Registration/capacity** (`registerForEvent`): wraps the "count existing registrations, compare
  to capacity, insert if there's room" sequence in a `BEGIN IMMEDIATE` transaction. `BEGIN
  IMMEDIATE` grabs SQLite's single writer lock *before* running any statements, instead of on the
  first write. Under WAL mode that lock is exclusive across the whole file — across every process
  that has it open, not just within one Node event loop — so a second registration attempt that
  starts while the first is still mid-transaction blocks until the first commits or rolls back,
  then re-reads the now-current count. There's no window where two concurrent requests can both
  see "49 of 50 taken" and both insert.
- **Check-in** (`checkinByToken`): a single conditional `UPDATE ... SET status = 'checked_in' ...
  WHERE qr_token = ? AND status = 'registered'`. SQLite executes the read-compare-write as one
  atomic statement; whichever concurrent request's `UPDATE` actually lands first is the one that
  flips the row, and every other request sees `changes === 0` and is reported as a duplicate. This
  is a compare-and-swap on the row, done by the database, not a `if (found) then update` done in
  application code with a lock around it — an in-process mutex wouldn't help here anyway, since the
  proof script hits two separate Node processes.

Proof script and sample log: see above.

### 2. Preventing QR screenshot/sharing abuse

**Choice: one-time-use token tied server-side to the registration, invalidated the moment it's
scanned** — not a rotating/short-lived token.

Each registration gets an opaque 48-hex-char random secret (`qr_token`, generated with
`crypto.randomBytes(24)`) at signup time, embedded in the QR as `TURNSTILE:<registrationId>:<token>`
(see [backend/src/services/qr.ts](backend/src/services/qr.ts)). The token never changes and never
needs the attendee's phone to talk to the server again after registration. The moment *any* scan of
it succeeds, the underlying registration flips to `checked_in` (via the exact same atomic `UPDATE`
described above), which permanently kills the token for every future scan — screenshotting it and
sending it to a friend only helps until the first person (whoever holds the code, race or not)
scans it once.

**Why not rotating tokens** (the QR re-encodes every N seconds, e.g. a TOTP-style scheme): I
considered it and rejected it specifically *because* of hard requirement #3. A rotating QR is only
valid if the attendee's phone is online near the door to keep re-fetching a fresh token — but
requirement #3 explicitly requires the *scanning device* to keep working offline, and there's no
way to validate a freshness window server-side for a scan that's queued locally and might not sync
for minutes. Rotating tokens and offline-tolerant scanning pull in opposite directions; I picked
the one compatible with both hard requirements simultaneously.

**Residual risk, honestly stated:** whoever scans a shared screenshot *first* — the real attendee or
the friend they sent it to — gets in; there's no cryptographic way to tell the two apart from a
single static code. The mitigation here is procedural, not technical: the scanner UI shows the
attendee's name on every successful scan, so door staff doing a quick visual/ID check catches the
mismatch case. A defense-in-depth follow-up (not implemented, out of scope for the time available)
would be adding a short-lived *second factor* only checked when the device is online — e.g. also
requiring the last 2 digits of a PIN shown in the attendee's app — while leaving the base QR
one-time-use so offline scanning still works as the fallback.

### 3. Offline-first scanning

The scanner ([frontend/src/pages/ScannerPage.tsx](frontend/src/pages/ScannerPage.tsx),
[frontend/src/lib/offlineQueue.ts](frontend/src/lib/offlineQueue.ts)) tries `/api/checkin` directly;
if the browser is offline (or a request throws a network error mid-flight, e.g. wifi drops between
the scan and the response), the scan is queued in `localStorage` instead of dropped, and the UI
shows it as "queued offline" rather than pretending it succeeded. A background loop (on the
`online` browser event, and every 5s as a fallback) flushes the queue through
`/api/checkin/sync-batch`, which runs each queued scan through the *exact same* atomic
`checkinByToken` used by live scans — see
[backend/src/routes/checkin.ts](backend/src/routes/checkin.ts). There's a "simulate offline"
checkbox on the scanner page so this is demoable without physically cutting wifi.

**The Station A / Station B edge case**, worked through explicitly: attendee's QR is scanned
offline at Station A at 6:00pm (station-local clock), then scanned online at Station B at 6:05pm,
before Station A regains connectivity. Station B's request reaches the server immediately and wins
— the row flips to `checked_in`. When Station A finally reconnects and syncs, its queued scan runs
through the same conditional `UPDATE`, sees `status != 'registered'`, and comes back as a
`duplicate` result with who/when it actually happened. Station A's UI surfaces this as a distinct
"already checked in elsewhere" entry in its activity feed — not a silent drop, not a second
check-in.

**Why server receipt order, not the client's `scannedAt` timestamp, is the tiebreaker:** an offline
device's clock can't be trusted to arbitrate against a station that was online the whole time —
it could be unsynced, or (if someone wanted to cheat) trivially set backward to make an offline
scan "win" a dispute after the fact. Server arrival order is the one signal that isn't
client-controlled. The tradeoff is that whichever station happens to sync last always loses ties in
its own favor, even when its offline scan was, in real wall-clock time, first — I judged a
consistent, tamper-resistant rule to be worth more than chasing "true" physical ordering that the
system fundamentally can't verify once a device has been offline.

`localStorage` (not IndexedDB) is used for the queue given the realistic scale here (a few dozen
scans at most during an offline window at a club event); IndexedDB would be the better choice if
this needed to reliably hold thousands of queued scans or arbitrary binary payloads.

### 4. AI-powered event insights

[backend/src/services/stats.ts](backend/src/services/stats.ts) computes every number the feature is
allowed to talk about — registered/checked-in counts, no-show percentage, spots left, and a
peak-check-in-minute derived by bucketing `checked_in_at` timestamps — directly from the same
SQLite tables everything else reads from. [backend/src/services/gemini.ts](backend/src/services/gemini.ts)
hands that computed JSON to Gemini 2.5 Flash-Lite along with a system instruction that explicitly
forbids inventing or estimating any number not present in the JSON, and asks it to just phrase the
answer in plain English. The Gemini API key only ever lives in the backend's `.env` and is called
from `insights.ts`/`gemini.ts` server-side — never sent to the client.

Requests are raced against a 10s timeout; any failure (no key configured, timeout, API error)
throws, and the route ([backend/src/routes/insights.ts](backend/src/routes/insights.ts)) catches it
and responds with `aiAvailable: false` plus the same raw `stats` object, so the frontend
([frontend/src/components/InsightsBox.tsx](frontend/src/components/InsightsBox.tsx)) can render the
numbers directly instead of crashing or showing nothing. The insights box shows a "Thinking…"
loading state while the request is in flight, and includes one-click buttons for the four required
example questions.

### Live dashboard

Implemented with Socket.io (not polling) — see
[backend/src/realtime.ts](backend/src/realtime.ts) and
[frontend/src/pages/DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx). Each check-in emits
to a per-event room (`event:<id>`), pushing both a live "just checked in" feed entry and refreshed
counts to every open dashboard for that event with no manual refresh.

### Roles

`requireAuth`/`requireRole` middleware ([backend/src/middleware/auth.ts](backend/src/middleware/auth.ts))
checks the role encoded in the signed JWT on every protected route — creating events, scanning,
viewing an event's registration list, exporting CSV, and querying AI insights are all rejected with
403 server-side for the wrong role, regardless of what the frontend does or doesn't show. The
frontend also hides irrelevant nav links/routes per role, but that's a UX nicety on top of the real
enforcement, not a substitute for it.

## What I'd do with more time / known limitations

- I didn't have camera hardware or a browser automation tool available while building this, so the
  scanner page's camera path (`html5-qrcode`) is verified by code review and a working `npm run
  build`/type-check, not a live scan — the manual payload-entry field on the scanner page exists
  partly so this path is testable without a camera. **Worth clicking through in an actual browser
  with a phone camera before the interview.**
- SQLite's single-writer model is what makes the concurrency guarantees easy to reason about and
  prove, but it puts a ceiling on write throughput (all writes across every process serialize
  through one lock) that a venue with many simultaneous scan stations at very large scale would
  eventually hit; Postgres with row-level locking would scale further at the cost of needing an
  external DB server.
- Registration is capped by whatever event capacity is set, but there's no waitlist for attendees
  who miss the cutoff — out of scope for the time available.

## AI tool disclosure

Built with Claude Code as a pair-programming tool. I can walk through any part of this — the exact
mechanism preventing a double check-in, why one-time-use tokens were chosen over rotating ones, the
offline reconciliation logic — in the interview.
