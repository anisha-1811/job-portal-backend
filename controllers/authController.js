const db = require("../config/db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Called when user logs in via Firebase on frontend
// Frontend sends Firebase UID + email → we create/find user in MySQL
// and return our own JWT token

exports.loginOrRegister = async (req, res) => {
  try {
    const { firebase_uid, email, display_name } = req.body;

    // Validate input
    if (!firebase_uid || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "firebase_uid and email are required." 
      });
    }

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
      // New user — generate ID and insert
      const [countResult] = await db.execute(
        "SELECT COUNT(*) AS total FROM applicants"
      );
      const count = countResult[0].total;
      applicant_id = "APP" + String(count + 1).padStart(8, "0");

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
      message: "Server error during authentication." 
    });
  }
};