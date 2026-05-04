const express  = require("express");
const cors     = require("cors");
require("dotenv").config();

const app = express();

// ── Middleware ──
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://job-application-portal-alpha.vercel.app"
  ],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ──
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/application", require("./routes/application"));

// ── Health check ──
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "Job Portal Backend is running!",
    version: "1.0.0"
  });
});

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ── Start server ──
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});