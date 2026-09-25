import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB, getDbInfo, isDbConnected } from "./db.js";
import { seedDatabase } from "./services/seedDb.js";
import authRoutes from "./routes/auth.js";
import explorationRoutes from "./routes/exploration.js";
import productionRoutes from "./routes/production.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);

// CORS — allow specific origins from env, or all in development
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map(o => o.trim())
  : null;

app.use(cors({
  origin: allowedOrigins
    ? (origin, cb) => {
        // Allow requests with no origin (curl, mobile apps, Postman)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : true,
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));


// System health check
app.get("/api/health", (req, res) => res.json({
  status: "ok",
  service: "MOIL SIH AI Mining Intelligence API",
  timestamp: new Date().toISOString(),
  database: getDbInfo(),
  environment: process.env.NODE_ENV || "development"
}));

app.use("/api/auth", authRoutes);
app.use("/api/exploration", explorationRoutes);
app.use("/api/production", productionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// Global error handler — catches JSON parse errors (SyntaxError from body-parser),
// validation errors, and any other unhandled route errors.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON in request body", detail: err.message });
  }
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  if (status === 500) console.error("[OreTwin API] Unhandled error:", err);
  res.status(status).json({ error: message });
});

// Connect to MongoDB & Seed initial data
await connectDB();
if (isDbConnected()) {
  await seedDatabase();
}

app.listen(PORT, () => {
  console.log(`[OreTwin API] Listening on http://localhost:${PORT}`);
  console.log(`[OreTwin API] MongoDB Status: ${isDbConnected() ? "ONLINE (Active)" : "OFFLINE (Fallback Active)"}`);
});

