import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, ApiError } from "../lib/api";
import { enqueueScan, loadQueue, removeFromQueue, getStationId, setStationId, type QueuedScan } from "../lib/offlineQueue";
import { AppShell } from "../components/layout/AppShell";
import { MaterialIcon } from "../ui/MaterialIcon";

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
const OVERLAY_DURATION_MS = 1800;

export function ScannerPage() {
  const [station, setStation] = useState(getStationId());
  const [forcedOffline, setForcedOffline] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedScan[]>(loadQueue());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [overlay, setOverlay] = useState<{ kind: "success" | "error"; title: string; detail: string } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ payload: string; at: number } | null>(null);
  const overlayTimeoutRef = useRef<number | null>(null);
  const isOffline = forcedOffline || !browserOnline;

  const showOverlay = useCallback((next: { kind: "success" | "error"; title: string; detail: string }) => {
    setOverlay(next);
    if (overlayTimeoutRef.current) window.clearTimeout(overlayTimeoutRef.current);
    overlayTimeoutRef.current = window.setTimeout(() => setOverlay(null), OVERLAY_DURATION_MS);
  }, []);

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
        showOverlay({ kind: "success", title: "Valid Ticket", detail: res.attendeeName });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          logActivity({ kind: "duplicate", text: err.message });
          showOverlay({ kind: "error", title: "Already Scanned", detail: err.message });
        } else if (err instanceof ApiError) {
          logActivity({ kind: "invalid", text: err.message });
          showOverlay({ kind: "error", title: "Invalid Ticket", detail: err.message });
        } else {
          // Fetch itself failed (network drop mid-request) — treat exactly like offline.
          enqueueScan(payload);
          setQueue(loadQueue());
          logActivity({ kind: "pending", text: "Network dropped — scan saved offline" });
        }
      }
    },
    [isOffline, station, logActivity, showOverlay]
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
      // stop() can reject *or* throw synchronously (e.g. called before start() finishes
      // initializing, which happens under StrictMode's mount->cleanup->mount in dev, or if
      // a user navigates away while the camera permission prompt is still pending) — either
      // path needs to be swallowed here, since an uncaught error blanks the whole page (no
      // error boundary above this route).
      try {
        Promise.resolve(scanner.stop()).catch(() => {}).finally(() => {
          try {
            scanner.clear();
          } catch {
            // already cleared/never started
          }
        });
      } catch {
        try {
          scanner.clear();
        } catch {
          // already cleared/never started
        }
      }
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

  const scannedCount = activity.filter((a) => a.kind === "success").length;

  return (
    <AppShell mainClassName="pt-16 min-h-screen bg-primary text-on-primary">
      <div className="flex flex-col w-full max-w-5xl mx-auto p-space-md gap-space-md">
        <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container/10 backdrop-blur-md rounded-lg border border-outline-variant/30 flex-wrap gap-space-sm">
          <div className="flex items-center gap-space-md flex-wrap">
            <button
              type="button"
              onClick={() => setForcedOffline((v) => !v)}
              className="flex items-center gap-space-xs bg-transparent border-none p-0 cursor-pointer"
              title="Toggle simulate-offline (for testing without disconnecting wifi)"
            >
              <span className={`w-3 h-3 rounded-full ${isOffline ? "bg-tertiary-fixed-dim" : "bg-secondary-fixed animate-pulse"}`} />
              <span className={`font-label-md tracking-widest uppercase ${isOffline ? "text-tertiary-fixed-dim" : "text-secondary-fixed"}`}>
                {isOffline ? "Offline" : "Online"}
              </span>
            </button>
            <div className="w-px h-4 bg-outline-variant/50" />
            <div className="flex items-center gap-space-xs text-on-primary/70 font-code-md">
              <MaterialIcon name="sync" className="text-[18px]" />
              {queue.length} pending sync{syncing ? " — syncing…" : ""}
            </div>
          </div>
          <label className="flex items-center gap-space-xs font-code-md text-code-md text-on-primary/70">
            Station:
            <input
              className="bg-surface-container/20 border border-outline-variant/30 px-space-sm py-unit text-on-primary outline-none focus:border-primary-fixed"
              value={station}
              onChange={(e) => {
                setStation(e.target.value);
                setStationId(e.target.value);
              }}
            />
          </label>
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center bg-primary-container rounded-xl overflow-hidden shadow-xl border border-outline-variant/20 min-h-[360px]">
          <div id="qr-reader" className="absolute inset-0 w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />

          <div className="absolute inset-0 z-10 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-primary-fixed/50 rounded-lg">
              <div className="absolute -top-[2px] -left-[2px] w-8 h-8 border-t-4 border-l-4 border-secondary-fixed rounded-tl-lg" />
              <div className="absolute -top-[2px] -right-[2px] w-8 h-8 border-t-4 border-r-4 border-secondary-fixed rounded-tr-lg" />
              <div className="absolute -bottom-[2px] -left-[2px] w-8 h-8 border-b-4 border-l-4 border-secondary-fixed rounded-bl-lg" />
              <div className="absolute -bottom-[2px] -right-[2px] w-8 h-8 border-b-4 border-r-4 border-secondary-fixed rounded-br-lg" />
            </div>
          </div>

          {cameraError ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-space-sm text-center px-space-md bg-primary-container/95">
              <MaterialIcon name="videocam_off" className="text-[40px] text-on-primary-container/70" />
              <p className="font-body-md text-body-md text-on-primary-container">Camera unavailable ({cameraError})</p>
              <p className="font-body-md text-body-md text-on-primary-container/70">Use manual entry below instead.</p>
            </div>
          ) : (
            <div className="absolute bottom-space-lg left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-space-sm w-full max-w-sm px-space-md pointer-events-none">
              <div className="font-headline-md text-on-primary text-center drop-shadow-md">Scan QR Code</div>
              <div className="font-body-md text-on-surface-variant text-center px-space-md py-space-xs bg-surface-container/30 backdrop-blur-md rounded-full shadow-sm">
                Position code within frame to check-in
              </div>
            </div>
          )}

          {overlay && (
            <div
              className={`absolute inset-0 z-30 backdrop-blur-sm flex flex-col items-center justify-center transition-all duration-300 ${
                overlay.kind === "success" ? "bg-secondary/90" : "bg-error/95"
              }`}
            >
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center mb-space-md shadow-lg ${
                  overlay.kind === "success" ? "bg-on-secondary" : "bg-on-error"
                }`}
              >
                <MaterialIcon
                  name={overlay.kind === "success" ? "check_circle" : "cancel"}
                  className={`text-[48px] ${overlay.kind === "success" ? "text-secondary" : "text-error"}`}
                />
              </div>
              <div className={`font-display-lg mb-space-xs text-center leading-tight ${overlay.kind === "success" ? "text-on-secondary" : "text-on-error"}`}>
                {overlay.title}
              </div>
              <div
                className={`font-headline-md mt-space-xs px-space-md py-space-xs rounded-full ${
                  overlay.kind === "success" ? "text-on-secondary-container bg-secondary-fixed" : "text-error-container"
                }`}
              >
                {overlay.detail}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
          <div className="bg-surface-container-highest rounded-xl p-space-md flex flex-col justify-between border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-on-surface-variant tracking-wider uppercase">Scanned</span>
              <MaterialIcon name="how_to_reg" className="text-secondary-fixed text-[20px]" />
            </div>
            <div className="font-display-lg text-on-surface">{scannedCount}</div>
          </div>

          <form
            className="bg-surface-container-highest rounded-xl p-space-md flex flex-col gap-space-sm border border-outline-variant/30"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualPayload.trim()) {
                void handleScan(manualPayload.trim());
                setManualPayload("");
              }
            }}
          >
            <span className="font-label-md text-on-surface-variant tracking-wider uppercase">Manual Entry</span>
            <div className="flex gap-space-xs">
              <input
                className="flex-1 min-w-0 bg-surface border border-outline text-on-surface px-space-sm py-unit outline-none focus:border-primary"
                value={manualPayload}
                onChange={(e) => setManualPayload(e.target.value)}
                placeholder="TURNSTILE:..."
              />
              <button type="submit" className="px-space-sm bg-primary text-on-primary font-label-md uppercase shrink-0">
                Go
              </button>
            </div>
          </form>
        </div>

        <div className="bg-surface-container-lowest text-on-surface rounded-xl p-space-md">
          <h2 className="font-title-md text-title-md mb-space-sm">Activity</h2>
          {activity.length === 0 && <p className="font-body-md text-body-md text-on-surface-variant">No scans yet.</p>}
          <ul className="flex flex-col divide-y divide-outline-variant max-h-64 overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between items-center py-space-xs gap-space-sm">
                <span
                  className={`font-label-md text-label-md px-space-sm py-unit uppercase ${
                    a.kind === "success"
                      ? "bg-secondary text-on-secondary"
                      : a.kind === "pending"
                        ? "bg-tertiary-fixed text-on-tertiary-fixed"
                        : "bg-error text-on-error"
                  }`}
                >
                  {a.text}
                </span>
                <time className="font-code-md text-code-md text-on-surface-variant shrink-0">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
