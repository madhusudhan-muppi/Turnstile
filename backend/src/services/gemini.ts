import { GoogleGenAI } from "@google/genai";
import type { EventStats } from "./stats.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const TIMEOUT_MS = 10_000;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out")), ms)
    ),
  ]);
}

const SYSTEM_INSTRUCTION = `You are a data assistant for "Turnstile", an event check-in system.
You answer an event organizer's plain-English question using ONLY the JSON stats provided below.
Rules:
- Never invent, estimate, or round numbers beyond what's given. Every number in your answer must
  come directly from the JSON.
- If the question asks for something the JSON doesn't contain, say plainly that you don't have that
  data, rather than guessing.
- Be concise: 1-3 sentences, plain English, no markdown, suitable for a small dashboard widget.
- "peakCheckinMinute" is the minute (YYYY-MM-DDTHH:MM) with the most check-ins; convert it to a
  friendly time when mentioning it.`;

/**
 * Answers a natural-language question about one event's live stats using Gemini.
 * Throws on failure/timeout — callers must catch and fall back to raw stats,
 * never let this crash the request or surface a hallucinated number.
 */
export async function answerInsightQuery(question: string, stats: EventStats): Promise<string> {
  const ai = getClient();
  if (!ai) throw new Error("GEMINI_API_KEY is not configured");

  const prompt = `Event stats (JSON):\n${JSON.stringify(stats, null, 2)}\n\nOrganizer's question: ${question}`;

  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    }),
    TIMEOUT_MS
  );

  const text = response.text;
  if (!text) throw new Error("AI returned an empty response");
  return text.trim();
}
