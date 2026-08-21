import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { eventsRouter } from "./routes/events.js";
import { registrationsRouter } from "./routes/registrations.js";
import { checkinRouter } from "./routes/checkin.js";
import { exportRouter } from "./routes/export.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api", registrationsRouter);
  app.use("/api", checkinRouter);
  app.use("/api", exportRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
  });

  return app;
}
