import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, ApiError } from "../lib/api";
import { enqueueScan, loadQueue, removeFromQueue, getStationId, setStationId, type QueuedScan } from "../lib/offlineQueue";

interface CheckinResponse {
  success: true;
  attendeeName: string;
  eventName: string;
  checkedInAt: string;
}
interface SyncResult {
  clientScanId: string;
  status: "checked_in" | "duplicate" | "invalid";
  message: string;
  attendeeName?: string;
  checkedInAt?: string | null;
}

interface ActivityItem {
  id: string;
  kind: "success" | "duplicate" | "invalid" | "pending";
  text: string;
  timestamp: string;
}

const SCAN_COOLDOWN_MS = 2000;

export function ScannerPage() {
  const [station, setStation] = useState(getStationId());
  const [forcedOffline, setForcedOffline] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedScan[]>(loadQueue());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [syncing, setSyncing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ payload: string; at: number } | null>(null);
  const isOffline = forcedOffline || !browserOnline;

  const logActivity = useCallback((item: Omit<ActivityItem, "id" | "timestamp">) => {
    setActivity((prev) =>
      [{ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...item }, ...prev].slice(0, 50)
    );
  }, []);

  const handleScan = useCallback(
    async (payload: string) => {
      const now = Date.now();
      if (lastScanRef.current?.payload === payload && now - lastScanRef.current.at < SCAN_COOLDOWN_MS) {
        return; // camera re-reading the same code still in frame
      }
      lastScanRef.current = { payload, at: now };

      if (isOffline) {
        enqueueScan(payload);
        setQueue(loadQueue());
        logActivity({ kind: "pending", text: "Scan saved offline — will sync when back online" });
        return;
      }

      try {
        const res = await api.post<CheckinResponse>("/api/checkin", { payload, station });
        logActivity({ kind: "success", text: `${res.attendeeName} checked in` });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          logActivity({ kind: "duplicate", text: err.message });
        } else if (err instanceof ApiError) {
          logActivity({ kind: "invalid", text: err.message });
        } else {
          // Fetch itself failed (network drop mid-request) — treat exactly like offline.
          enqueueScan(payload);
          setQueue(loadQueue());
          logActivity({ kind: "pending", text: "Network dropped — scan saved offline" });
        }
      }
    },
    [isOffline, station, logActivity]
  );

  // handleScan closes over `station`/`isOffline`; the camera is only started once
  // (see below), so its decode callback must read through a ref to always see the
  // latest station name / offline toggle instead of whatever was current on mount.
  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  // --- camera lifecycle ---
  useEffect(() => {
    const el = document.getElementById("qr-reader");
    if (!el) return;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          void handleScanRef.current(decodedText);
        },
        () => {
          /* per-frame "no QR found" noise, ignore */
        }
      )
      .catch((err) => setCameraError(err?.message ?? "Could not start camera"));

    return () => {
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };
  }, []);

  // --- online/offline detection ---
  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // --- sync the offline queue whenever we're back online ---
  const syncQueue = useCallback(async () => {
    const pending = loadQueue();
    if (pending.length === 0 || isOffline) return;
    setSyncing(true);
    try {
      const res = await api.post<{ results: SyncResult[] }>("/api/checkin/sync-batch", {
        station,
        scans: pending.map(({ clientScanId, payload }) => ({ clientScanId, payload })),
      });
      removeFromQueue(res.results.map((r) => r.clientScanId));
      setQueue(loadQueue());
      for (const r of res.results) {
        const kind = r.status === "checked_in" ? "success" : r.status === "duplicate" ? "duplicate" : "invalid";
        logActivity({ kind, text: `[synced] ${r.message}` });
      }
    } catch {
      // Sync itself failed (still offline, or server hiccup) — leave queue intact, retry next tick.
    } finally {
      setSyncing(false);
    }
  }, [isOffline, station, logActivity]);

  useEffect(() => {
    if (!isOffline) void syncQueue();
    const interval = setInterval(() => {
      if (!isOffline) void syncQueue();
    }, 5000);
    return () => clearInterval(interval);
  }, [isOffline, syncQueue]);

  return (
    <div className="scanner-page">
      <div className="page-header">
        <h1>Scan to check in</h1>
        <span className={`pill ${isOffline ? "offline" : "online"}`}>
          {isOffline ? "○ Offline" : "● Online"}
        </span>
      </div>

      <div className="card">
        <label>
          Station name (shown in export &amp; duplicate-scan messages)
          <input
            value={station}
            onChange={(e) => {
              setStation(e.target.value);
              setStationId(e.target.value);
            }}
          />
        </label>
        <label className="radio" style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={forcedOffline}
            onChange={(e) => setForcedOffline(e.target.checked)}
          />
          Simulate offline (for testing without disconnecting wifi)
        </label>
      </div>

      <div className="card">
        <div id="qr-reader" />
        {cameraError && (
          <p className="error-text">
            Camera unavailable ({cameraError}). Use manual entry below instead.
          </p>
        )}
      </div>

      <div className="card">
        <label>
          Manual entry (paste a scanned QR payload — useful for testing without a camera)
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              style={{ flex: 1 }}
              value={manualPayload}
              onChange={(e) => setManualPayload(e.target.value)}
              placeholder="TURNSTILE:..."
            />
            <button
              type="button"
              onClick={() => {
                if (manualPayload.trim()) {
                  void handleScan(manualPayload.trim());
                  setManualPayload("");
                }
              }}
            >
              Submit
            </button>
          </div>
        </label>
      </div>

      {queue.length > 0 && (
        <p className="badge warning">
          {queue.length} scan{queue.length === 1 ? "" : "s"} queued offline
          {syncing ? " — syncing…" : ""}
        </p>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Activity</h2>
        {activity.length === 0 && <p className="muted">No scans yet.</p>}
        <ul className="checkin-list">
          {activity.map((a) => (
            <li key={a.id}>
              <span className={`scan-result ${a.kind === "pending" ? "pending" : a.kind === "success" ? "success" : "error"}`} style={{ padding: "0.3rem 0.6rem" }}>
                {a.text}
              </span>
              <time>{new Date(a.timestamp).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
