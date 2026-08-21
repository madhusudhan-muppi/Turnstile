import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
  });

  return app;
}
