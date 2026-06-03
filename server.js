const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
require("dotenv").config();

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  "https://job-application-portal-alpha.vercel.app",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
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
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

// ✅ Increased from 10 to 50 per minute — was causing false 500 errors during testing
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 50,
  standardHeaders: true, legacyHeaders: false,
  // ✅ Returns 429 (not 500) so frontend shows a clear message
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many AI requests. Please wait a moment and try again.",
    });
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",        authLimiter, require("./routes/auth"));
app.use("/api/application", apiLimiter,  require("./routes/application"));
app.use("/api/ai",          aiLimiter,   require("./routes/ai"));
app.use("/api/jobs",        apiLimiter,  require("./routes/jobs"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Job Portal Backend is running!",
    version: "3.0.0",
    ai: process.env.GEMINI_API_KEY ? "✅ Gemini connected" : "❌ GEMINI_API_KEY missing",
  });
});

// ── Keep-alive ping (prevents Render free tier from sleeping) ─────────────────
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`;
setInterval(async () => {
  try {
    const http = require("http");
    const https = require("https");
    const client = BACKEND_URL.startsWith("https") ? https : http;
    client.get(`${BACKEND_URL}/`, () => {
      console.log("🏓 Keep-alive ping sent");
    }).on("error", () => {});
  } catch (e) {}
}, 14 * 60 * 1000);

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
  console.log(`🏓 Keep-alive: pinging ${BACKEND_URL} every 14 minutes`);
});