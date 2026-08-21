export interface QueuedScan {
  clientScanId: string;
  payload: string;
  scannedAt: string;
}

const QUEUE_KEY = "turnstile.offlineQueue";

export function loadQueue(): QueuedScan[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedScan[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Called the moment a scan can't reach the server. Stored locally so it survives a page reload. */
export function enqueueScan(payload: string): QueuedScan {
  const scan: QueuedScan = {
    clientScanId: crypto.randomUUID(),
    payload,
    scannedAt: new Date().toISOString(),
  };
  saveQueue([...loadQueue(), scan]);
  return scan;
}

export function removeFromQueue(clientScanIds: string[]) {
  const ids = new Set(clientScanIds);
  saveQueue(loadQueue().filter((s) => !ids.has(s.clientScanId)));
}

const STATION_KEY = "turnstile.stationId";

export function getStationId(): string {
  let id = localStorage.getItem(STATION_KEY);
  if (!id) {
    id = `Station-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(STATION_KEY, id);
  }
  return id;
}

export function setStationId(id: string) {
  localStorage.setItem(STATION_KEY, id);
}
