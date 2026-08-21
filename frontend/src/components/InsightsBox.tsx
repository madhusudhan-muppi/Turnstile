import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { MaterialIcon } from "../ui/MaterialIcon";

interface EventStats {
  registeredCount: number;
  checkedInCount: number;
  noShowPercent: number;
  spotsLeft: number;
  peakCheckinMinute: string | null;
}

interface InsightsResponse {
  answer: string | null;
  aiAvailable: boolean;
  error?: string;
  stats: EventStats;
}

const SUGGESTIONS = [
  "How many people have checked in so far?",
  "What percentage of registered attendees are no-shows?",
  "What time did check-ins peak?",
  "How many spots are left?",
];

export function InsightsBox({ eventId }: { eventId: string }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<InsightsResponse>(`/api/events/${eventId}/insights`, { question: q });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reach the insights endpoint");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) ask(question.trim());
  }

  return (
    <section className="bg-primary text-on-primary p-space-md shadow-md flex flex-col gap-space-md h-full">
      <div className="flex items-center gap-space-sm font-label-md text-label-md text-primary-fixed">
        <MaterialIcon name="auto_awesome" className="text-[18px]" />
        AI ANALYSIS
      </div>

      <form onSubmit={onSubmit} className="flex gap-space-sm">
        <input
          className="flex-1 bg-on-primary/10 border border-on-primary/20 px-space-sm py-space-xs text-on-primary placeholder:text-on-primary/50 outline-none focus:border-primary-fixed"
          placeholder="Ask about this event…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="px-space-md bg-primary-fixed text-on-primary-fixed font-label-md text-label-md uppercase disabled:opacity-50"
        >
          {loading ? "…" : "Ask"}
        </button>
      </form>

      <div className="flex gap-space-xs flex-wrap">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            className="font-label-md text-label-md text-on-primary/70 hover:text-on-primary underline underline-offset-4 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-[120px]">
        {loading && (
          <div className="flex flex-col items-center gap-space-sm animate-pulse">
            <MaterialIcon name="memory" className="text-display-lg opacity-50" />
            <span className="font-code-md text-code-md text-on-primary/70">Processing telemetry…</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-space-sm text-center">
            <MaterialIcon name="cloud_off" className="text-[32px] text-error-container" />
            <p className="font-code-md text-code-md text-on-primary">{error}</p>
          </div>
        )}

        {result && !loading && (
          <div className="flex flex-col gap-space-sm">
            {result.aiAvailable ? (
              <p className="font-body-md text-body-md leading-relaxed">{result.answer}</p>
            ) : (
              <>
                <p className="font-body-md text-body-md leading-relaxed">
                  AI insights are unavailable right now ({result.error}). Here are the raw numbers:
                </p>
                <ul className="font-code-md text-code-md flex flex-col gap-unit">
                  <li>Registered: {result.stats.registeredCount}</li>
                  <li>Checked in: {result.stats.checkedInCount}</li>
                  <li>No-show rate: {result.stats.noShowPercent}%</li>
                  <li>Spots left: {result.stats.spotsLeft}</li>
                  <li>
                    Peak check-in minute:{" "}
                    {result.stats.peakCheckinMinute
                      ? new Date(result.stats.peakCheckinMinute).toLocaleTimeString()
                      : "n/a"}
                  </li>
                </ul>
              </>
            )}
            <div className="font-code-md text-code-md text-on-primary/70 border-t border-on-primary/20 pt-space-sm">
              Generated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        )}

        {!loading && !error && !result && (
          <p className="font-code-md text-code-md text-on-primary/50 text-center">
            Ask a question above to get started.
          </p>
        )}
      </div>
    </section>
  );
}
