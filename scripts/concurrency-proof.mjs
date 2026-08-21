#!/usr/bin/env node
// Fires concurrent requests at the registration and check-in endpoints, split
// across two separate backend processes (see run-concurrency-proof.sh) that
// both point at the same SQLite file, and verifies:
//   1) capacity is never exceeded even when far more people try to register
//      than there are spots, and
//   2) the same QR code scanned many times concurrently results in exactly
//      one successful check-in, everyone else cleanly rejected.
//
// Usage: node scripts/concurrency-proof.mjs
// (expects backends already running on PORTS below — run-concurrency-proof.sh
// handles that for you)

const PORTS = [4001, 4002];
const CAPACITY = 50;
const REGISTRATION_ATTEMPTS = 150;
const CHECKIN_ATTEMPTS = 120;

const urlFor = (i) => `http://localhost:${PORTS[i % PORTS.length]}`;

async function json(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

const log = [];
function say(line) {
  console.log(line);
  log.push(line);
}

async function main() {
  say(`=== Turnstile concurrency proof — ${new Date().toISOString()} ===`);
  say(`Backends: ${PORTS.map((p) => `http://localhost:${p}`).join(", ")} (same DB file)\n`);

  // --- setup: one organizer, one event with a small capacity ---
  const orgEmail = `proof-organizer-${Date.now()}@test.com`;
  const { data: orgSignup } = await json("POST", `${urlFor(0)}/api/auth/signup`, {
    email: orgEmail,
    password: "password123",
    name: "Proof Organizer",
    role: "organizer",
  });
  const orgToken = orgSignup.token;

  const { data: eventResp } = await json("POST", `${urlFor(0)}/api/events`, {
    name: "Concurrency Proof Event",
    date: "2026-12-01T18:00:00Z",
    capacity: CAPACITY,
  }, orgToken);
  const eventId = eventResp.event.id;
  say(`Created event ${eventId} with capacity=${CAPACITY}`);

  // --- create N attendee accounts up front (sequential; this part isn't the race) ---
  say(`\nSigning up ${REGISTRATION_ATTEMPTS} attendees...`);
  const attendeeTokens = [];
  for (let i = 0; i < REGISTRATION_ATTEMPTS; i++) {
    const { data } = await json("POST", `${urlFor(i)}/api/auth/signup`, {
      email: `proof-attendee-${Date.now()}-${i}@test.com`,
      password: "password123",
      name: `Attendee ${i}`,
      role: "attendee",
    });
    attendeeTokens.push(data.token);
  }

  // --- fire all registrations at once, split across both server processes ---
  say(`\nFiring ${REGISTRATION_ATTEMPTS} concurrent registration requests ` +
      `(capacity is ${CAPACITY}) across ${PORTS.length} server processes...`);
  const regStart = Date.now();
  const regResults = await Promise.allSettled(
    attendeeTokens.map((token, i) =>
      json("POST", `${urlFor(i)}/api/events/${eventId}/register`, undefined, token)
    )
  );
  const regMs = Date.now() - regStart;

  const regSuccesses = regResults.filter((r) => r.status === "fulfilled" && r.value.status === 201);
  const regRejections = regResults.filter((r) => r.status === "fulfilled" && r.value.status === 409);
  const regOther = regResults.filter(
    (r) => r.status === "rejected" || (r.value.status !== 201 && r.value.status !== 409)
  );

  say(`  Completed in ${regMs}ms`);
  say(`  Successful registrations: ${regSuccesses.length}`);
  say(`  Rejected as EVENT_FULL:   ${regRejections.length}`);
  say(`  Unexpected outcomes:      ${regOther.length}`);
  if (regOther.length) {
    for (const r of regOther.slice(0, 5)) {
      say(`    unexpected: ${JSON.stringify(r.status === "fulfilled" ? r.value : r.reason)}`);
    }
  }

  const { data: eventAfter } = await json("GET", `${urlFor(0)}/api/events/${eventId}`, undefined, orgToken);
  const capacityRespected =
    regSuccesses.length === CAPACITY && eventAfter.event.registeredCount === CAPACITY;

  say(
    capacityRespected
      ? `  PASS: exactly ${CAPACITY} succeeded, DB shows registeredCount=${eventAfter.event.registeredCount}\n`
      : `  FAIL: expected exactly ${CAPACITY} successes and registeredCount=${CAPACITY}, ` +
        `got ${regSuccesses.length} successes / registeredCount=${eventAfter.event.registeredCount}\n`
  );

  // --- duplicate check-in proof: same QR, hammered concurrently ---
  say(`Fetching one successful registration's QR payload for the duplicate-checkin proof...`);
  const firstSuccess = regResults.find((r) => r.status === "fulfilled" && r.value.status === 201);
  const winnerToken = attendeeTokens[regResults.indexOf(firstSuccess)];
  const { data: mine } = await json("GET", `${urlFor(0)}/api/registrations/mine`, undefined, winnerToken);
  const payload = mine.registrations[0].qrPayload;

  say(`Firing ${CHECKIN_ATTEMPTS} concurrent check-in requests at the SAME QR code ` +
      `across ${PORTS.length} server processes...`);
  const checkinStart = Date.now();
  const checkinResults = await Promise.allSettled(
    Array.from({ length: CHECKIN_ATTEMPTS }, (_, i) =>
      json("POST", `${urlFor(i)}/api/checkin`, { payload, station: `proof-${i % PORTS.length}` }, orgToken)
    )
  );
  const checkinMs = Date.now() - checkinStart;

  const checkinSuccesses = checkinResults.filter((r) => r.status === "fulfilled" && r.value.status === 200);
  const checkinDuplicates = checkinResults.filter((r) => r.status === "fulfilled" && r.value.status === 409);
  const checkinOther = checkinResults.filter(
    (r) => r.status === "rejected" || (r.value.status !== 200 && r.value.status !== 409)
  );

  say(`  Completed in ${checkinMs}ms`);
  say(`  Successful check-ins:         ${checkinSuccesses.length}`);
  say(`  Rejected as ALREADY_CHECKED_IN: ${checkinDuplicates.length}`);
  say(`  Unexpected outcomes:           ${checkinOther.length}`);
  if (checkinOther.length) {
    for (const r of checkinOther.slice(0, 5)) {
      say(`    unexpected: ${JSON.stringify(r.status === "fulfilled" ? r.value : r.reason)}`);
    }
  }
  if (checkinDuplicates[0]) {
    say(`  Sample rejection message: "${checkinDuplicates[0].value.data.error}"`);
  }

  const checkinCorrect = checkinSuccesses.length === 1 && checkinDuplicates.length === CHECKIN_ATTEMPTS - 1;
  say(
    checkinCorrect
      ? `  PASS: exactly 1 of ${CHECKIN_ATTEMPTS} concurrent scans of the same QR succeeded\n`
      : `  FAIL: expected exactly 1 success, got ${checkinSuccesses.length}\n`
  );

  say(`=== ${capacityRespected && checkinCorrect ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} ===`);

  const fs = await import("node:fs");
  fs.mkdirSync("scripts/proof-logs", { recursive: true });
  const logPath = `scripts/proof-logs/run-${Date.now()}.log`;
  fs.writeFileSync(logPath, log.join("\n") + "\n");
  console.log(`\nLog written to ${logPath}`);

  process.exit(capacityRespected && checkinCorrect ? 0 : 1);
}

main().catch((err) => {
  console.error("Proof script crashed:", err);
  process.exit(1);
});
