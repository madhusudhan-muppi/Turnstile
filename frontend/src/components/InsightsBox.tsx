import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";

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
    <div className="card insights-box">
      <h2 style={{ margin: 0 }}>Ask about this event</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          style={{ flex: 1 }}
          placeholder="e.g. How many people have checked in so far?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="secondary"
            disabled={loading}
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Thinking…</p>}
      {error && <p className="error-text">{error}</p>}

      {result && !loading && (
        <div className="answer">
          {result.aiAvailable ? (
            result.answer
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                AI insights are unavailable right now ({result.error}). Here are the raw numbers:
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
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
        </div>
      )}
    </div>
  );
}
