import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { isDbConnected, getDbInfo } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const memUsers = new Map();

function tokenFor(user) {
  return jwt.sign(
    {
      id: String(user._id || user.id),
      email: user.email,
      role: user.role || "exploration",
      name: user.name
    },
    process.env.JWT_SECRET || "dev-secret-key-moil-sih-2026",
    { expiresIn: "30d" }
  );
}

router.post("/register", async (req, res) => {
  const { name, email, password, role = "exploration" } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  const normalized = email.toLowerCase().trim();

  try {
    if (isDbConnected()) {
      const existing = await User.findOne({ email: normalized });
      if (existing) return res.status(409).json({ message: "Email is already registered" });
      
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email: normalized,
        passwordHash,
        role: ["admin", "exploration", "production"].includes(role) ? role : "exploration"
      });
      
      return res.status(201).json({
        token: tokenFor(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role, source: "mongodb" }
      });
    }

    // Fallback if MongoDB is offline
    if (memUsers.has(normalized)) return res.status(409).json({ message: "Email is already registered" });
    const user = {
      id: crypto.randomUUID(),
      name,
      email: normalized,
      passwordHash: await bcrypt.hash(password, 10),
      role: "exploration"
    };
    memUsers.set(normalized, user);
    return res.status(201).json({
      token: tokenFor(user),
      user: { id: user.id, name, email: normalized, role: user.role, source: "in-memory" }
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalized = (email || "").toLowerCase().trim();
  
  try {
    let user = null;
    let source = "mongodb";

    if (isDbConnected()) {
      user = await User.findOne({ email: normalized });
    }
    
    if (!user && memUsers.has(normalized)) {
      user = memUsers.get(normalized);
      source = "in-memory";
    }

    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return res.json({
      token: tokenFor(user),
      user: {
        id: String(user._id || user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        source
      }
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    let user = null;
    if (isDbConnected()) {
      user = await User.findById(req.user.id).select("-passwordHash");
    }
    res.json({
      user: user || req.user,
      database: getDbInfo()
    });
  } catch (e) {
    res.json({ user: req.user, database: getDbInfo() });
  }
});

export default router;
