import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeEventStats } from "../services/stats.js";
import { answerInsightQuery } from "../services/gemini.js";

export const insightsRouter = Router();

insightsRouter.post(
  "/events/:id/insights",
  requireAuth,
  requireRole("organizer"),
  async (req, res) => {
    const event = db.prepare("SELECT organizer_id FROM events WHERE id = ?").get(req.params.id) as
      | { organizer_id: string }
      | undefined;
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.organizer_id !== req.user!.id) {
      return res.status(403).json({ error: "You do not organize this event" });
    }

    const { question } = req.body ?? {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    const stats = computeEventStats(req.params.id)!;

    try {
      const answer = await answerInsightQuery(question, stats);
      res.json({ answer, aiAvailable: true, stats });
    } catch (err) {
      // AI down, timed out, or no key configured — fall back to the raw numbers
      // instead of crashing or guessing.
      res.json({
        answer: null,
        aiAvailable: false,
        error: err instanceof Error ? err.message : "AI is currently unavailable",
        stats,
      });
    }
  }
);
