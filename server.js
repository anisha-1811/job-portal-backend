// server.js  — updated for Phase 4 (jobs route + env-based CORS)
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
require("dotenv").config();

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
// BUG FIX: was hardcoded Vercel URL → now uses FRONTEND_URL env var with fallback
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,                          // set this in Railway/Render env vars
  "https://job-application-portal-alpha.vercel.app", // keep old URL as extra fallback
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "AI rate limit reached. Please wait a moment." },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",        authLimiter, require("./routes/auth"));
app.use("/api/application", apiLimiter,  require("./routes/application"));
app.use("/api/ai",          aiLimiter,   require("./routes/ai"));
app.use("/api/jobs",        apiLimiter,  require("./routes/jobs"));   // ✅ Phase 4 NEW

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Job Portal Backend is running!",
    version: "3.0.0",
    ai: process.env.GEMINI_API_KEY ? "✅ Gemini connected" : "❌ GEMINI_API_KEY missing",
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error." });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🤖 Gemini AI: ${process.env.GEMINI_API_KEY ? "✅ Ready" : "❌ GEMINI_API_KEY not set"}`);
});