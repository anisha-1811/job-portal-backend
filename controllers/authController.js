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