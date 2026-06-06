const db = require("../config/db");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
require("dotenv").config();

// Called when user logs in via Firebase on frontend.
// Frontend sends Firebase UID + email → we create/find user in MySQL
// and return our own JWT token.

// ── Validation rules (used as middleware in routes/auth.js) ───────────────────
exports.loginValidation = [
  body("firebase_uid").notEmpty().withMessage("firebase_uid is required."),
  body("email").isEmail().normalizeEmail().withMessage("A valid email is required."),
  body("display_name").optional().trim().escape(),
];

exports.loginOrRegister = async (req, res) => {
  // Check validation results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { firebase_uid, email, display_name } = req.body;

    // Check if applicant already exists
    const [existing] = await db.execute(
      "SELECT * FROM applicants WHERE firebase_uid = ?",
      [firebase_uid]
    );

    let applicant_id;

    if (existing.length > 0) {
      // User exists — return their ID
      applicant_id = existing[0].applicant_id;
      console.log(`✅ Existing user login: ${email}`);
    } else {
      // New user — use UUID to avoid race conditions from COUNT(*)+1
      const [[{ uuid }]] = await db.execute("SELECT UUID() AS uuid");
      applicant_id = "APP" + uuid.replace(/-/g, "").slice(0, 10).toUpperCase();

      await db.execute(
        `INSERT INTO applicants
          (applicant_id, firebase_uid, email, display_name, status)
         VALUES (?, ?, ?, ?, 'draft')`,
        [applicant_id, firebase_uid, email, display_name || ""]
      );
      console.log(`✅ New user registered: ${email} → ${applicant_id}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { applicant_id, email, firebase_uid },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      applicant_id,
      email,
    });

  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during authentication.",
    });
  }
};

// ── Login by API ID + Password ────────────────────────────────────────────────
// POST /api/auth/login-by-id
// Accepts: { applicant_id, password }
// Looks up the applicant in MySQL, verifies password via Firebase REST API,
// and returns the same JWT the normal flow returns.
exports.loginByApiIdValidation = [
  body("applicant_id").notEmpty().withMessage("API ID is required."),
  body("password").notEmpty().withMessage("Password is required."),
];

exports.loginByApiId = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { applicant_id, password } = req.body;

    // 1. Find the applicant by API ID
    const [rows] = await db.execute(
      "SELECT applicant_id, firebase_uid, email, display_name FROM applicants WHERE applicant_id = ?",
      [applicant_id.trim().toUpperCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid API ID or password." });
    }

    const applicant = rows[0];

    // 2. Verify password via Firebase REST sign-in endpoint
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      return res.status(500).json({ success: false, message: "Server misconfiguration: missing FIREBASE_API_KEY." });
    }

    const firebaseRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:             applicant.email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const firebaseData = await firebaseRes.json();

    if (!firebaseRes.ok || firebaseData.error) {
      // Firebase returns INVALID_PASSWORD or EMAIL_NOT_FOUND etc.
      return res.status(401).json({ success: false, message: "Invalid API ID or password." });
    }

    // 3. Issue our own JWT (same shape as normal login)
    const token = jwt.sign(
      { applicant_id: applicant.applicant_id, email: applicant.email, firebase_uid: applicant.firebase_uid },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`✅ API ID login: ${applicant.applicant_id}`);

    return res.status(200).json({
      success:      true,
      message:      "Login successful",
      token,
      applicant_id: applicant.applicant_id,
      email:        applicant.email,
    });

  } catch (err) {
    console.error("loginByApiId error:", err);
    return res.status(500).json({ success: false, message: "Server error during authentication." });
  }
};