import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { signToken } from "../services/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthUser, Role } from "../types.js";

export const authRouter = Router();

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
}

authRouter.post("/signup", async (req, res) => {
  const { email, password, name, role } = req.body ?? {};

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: "email, password, name, and role are required" });
  }
  if (role !== "organizer" && role !== "attendee") {
    return res.status(400).json({ error: "role must be 'organizer' or 'attendee'" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)"
  ).run(id, email, passwordHash, name, role);

  const user: AuthUser = { id, email, name, role };
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!row) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user: AuthUser = { id: row.id, email: row.email, name: row.name, role: row.role };
  res.json({ token: signToken(user), user });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
