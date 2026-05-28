// routes/ai.js  — Phase 1, 2, 3 (existing) + Phase 4 (job-match) added
const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const authMiddleware = require("../middleware/verifyToken");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Multer — memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function safeParseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── PHASE 2 — AI Resume Generator ───────────────────────────────────────────

router.post("/generate-resume", authMiddleware, async (req, res) => {
  try {
    const { formData } = req.body;
    const prompt = `
You are an expert resume writer. Generate a professional, ATS-friendly resume based on the following information.
Return ONLY a valid JSON object with NO markdown, NO extra text.

Candidate Data:
${JSON.stringify(formData, null, 2)}

Return this exact JSON structure:
{
  "name": "Full Name",
  "email": "email",
  "phone": "phone",
  "location": "city, state",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Start - End",
      "bullets": ["achievement 1", "achievement 2", "achievement 3"]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "tech": ["tech1", "tech2"],
      "bullets": ["key point 1", "key point 2"]
    }
  ],
  "certifications": ["cert1", "cert2"],
  "education": {
    "degree": "Degree",
    "institution": "Institution",
    "year": "Year",
    "cgpa": "CGPA if available"
  }
}`;

    const raw = await callGemini(prompt);
    const parsed = safeParseJSON(raw);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("generate-resume error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PHASE 3 — ATS Score Checker ─────────────────────────────────────────────

router.post(
  "/ats-score",
  authMiddleware,
  upload.single("resume"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Resume PDF is required." });
      }
      const { jobDescription, jobTitle = "the role" } = req.body;
      if (!jobDescription || jobDescription.trim().length < 50) {
        return res.status(400).json({
          success: false,
          error: "Job description must be at least 50 characters.",
        });
      }

      let resumeText;
      try {
        const parsed = await pdfParse(req.file.buffer);
        resumeText = parsed.text.trim();
      } catch {
        return res.status(422).json({
          success: false,
          error: "Could not parse PDF. Please ensure it is a text-based (non-scanned) PDF.",
        });
      }

      if (!resumeText || resumeText.length < 100) {
        return res.status(422).json({
          success: false,
          error: "Resume appears to be a scanned image PDF. Please upload a text-based PDF.",
        });
      }

      const prompt = `
You are an expert ATS (Applicant Tracking System) and technical recruiter.
Analyze the resume against the job description and return a detailed ATS compatibility report.

RESUME TEXT:
"""
${resumeText.slice(0, 4000)}
"""

JOB DESCRIPTION:
"""
${jobDescription.slice(0, 2000)}
"""

JOB TITLE: ${jobTitle}

Analyze thoroughly and return ONLY a valid JSON object (no markdown, no extra text):

{
  "overall_score": <integer 0-100>,
  "grade": <"A" | "B" | "C" | "D" | "F">,
  "verdict": "<one sentence overall verdict>",
  "section_scores": {
    "keywords": <0-100>,
    "experience": <0-100>,
    "skills": <0-100>,
    "education": <0-100>,
    "formatting": <0-100>
  },
  "matched_keywords": ["keyword1", "keyword2", ...],
  "missing_keywords": ["keyword1", "keyword2", ...],
  "strengths": ["strength point 1", "strength point 2", "strength point 3"],
  "gaps": ["gap 1", "gap 2", "gap 3"],
  "suggestions": [
    { "priority": "high", "action": "Specific actionable suggestion 1" },
    { "priority": "high", "action": "Specific actionable suggestion 2" },
    { "priority": "medium", "action": "Specific actionable suggestion 3" },
    { "priority": "medium", "action": "Specific actionable suggestion 4" },
    { "priority": "low", "action": "Specific actionable suggestion 5" }
  ],
  "keyword_density": <float, percentage of JD keywords found in resume>,
  "estimated_shortlist_chance": "<Low | Medium | High | Very High>"
}`;

      const raw = await callGemini(prompt);
      const atsResult = safeParseJSON(raw);

      atsResult.resume_filename = req.file.originalname;
      atsResult.analyzed_at = new Date().toISOString();
      atsResult.resume_word_count = resumeText.split(/\s+/).length;

      res.json({ success: true, data: atsResult });
    } catch (err) {
      console.error("ats-score error:", err);
      res.status(500).json({ success: false, error: "ATS analysis failed. Please try again." });
    }
  }
);

// ─── PHASE 4 — AI Job Matching ────────────────────────────────────────────────
// POST /api/ai/job-match
// Body: { formData: { skillsList, experiences, ... }, jobListings: [...] }
// Returns: sorted array of { jobId, matchScore, matchReasons, missingSkills, applyRecommendation }

router.post("/job-match", authMiddleware, async (req, res) => {
  try {
    const { formData, jobListings } = req.body;

    if (!formData || !Array.isArray(jobListings) || jobListings.length === 0) {
      return res.status(400).json({
        success: false,
        error: "formData and a non-empty jobListings array are required.",
      });
    }

    // Limit to avoid very long prompts; score max 10 at a time
    const batchSize = Math.min(jobListings.length, 10);
    const batch = jobListings.slice(0, batchSize);

    const prompt = `
You are an expert technical recruiter and career coach. Score how well a candidate matches each job listing.

CANDIDATE PROFILE:
${JSON.stringify(
  {
    skills: formData.skillsList || [],
    targetRole: formData.targetRole || "",
    experiences: (formData.experiences || []).map((e) => ({
      role: e.role,
      company: e.company,
      description: e.description,
    })),
    internships: (formData.internshipsList || []).map((i) => ({
      role: i.role,
      company: i.company,
    })),
    projects: (formData.projectsList || []).map((p) => ({
      name: p.name,
      tech: p.tech,
    })),
    education: formData.degrees || [],
  },
  null,
  2
)}

JOB LISTINGS TO SCORE:
${JSON.stringify(
  batch.map((j) => ({
    jobId: j.id,
    title: j.title,
    company: j.company,
    skills: j.skills,
    experience: j.experience,
    description: j.description,
    requirements: j.requirements,
  })),
  null,
  2
)}

For EACH job listing, analyze:
1. Skill overlap (what skills match, what's missing)
2. Experience level fit
3. Overall match score

Return ONLY a valid JSON array (no markdown, no extra text):

[
  {
    "jobId": "job_001",
    "matchScore": <integer 0-100>,
    "matchReasons": ["reason 1 why they're a good fit", "reason 2"],
    "missingSkills": ["skill they lack but job needs"],
    "applyRecommendation": "<strong | moderate | stretch>",
    "tip": "One specific action to improve chances for this role"
  }
]

Scoring guide:
- 80-100: strong match — most required skills present, good experience fit
- 60-79: moderate match — some gaps but transferable skills
- 40-59: stretch — significant gaps but worth trying
- 0-39: poor fit — major skill/experience mismatch

Return results sorted best match first (highest matchScore first).
Return the array ONLY. No explanation text.`;

    const raw = await callGemini(prompt);
    const matches = safeParseJSON(raw);

    // Sort by score descending (Gemini should already do this, but just in case)
    const sorted = Array.isArray(matches)
      ? matches.sort((a, b) => b.matchScore - a.matchScore)
      : [];

    res.json({ success: true, data: sorted });
  } catch (err) {
    console.error("job-match error:", err);
    res.status(500).json({
      success: false,
      error: "AI job matching failed. Please try again.",
    });
  }
});

// ─── PHASE 6 STUBS ────────────────────────────────────────────────────────────

router.post("/cover-letter", authMiddleware, async (req, res) => {
  res.json({ success: false, error: "Coming in Phase 6" });
});

router.post("/skill-gap", authMiddleware, async (req, res) => {
  res.json({ success: false, error: "Coming in Phase 6" });
});

router.post("/mock-interview", authMiddleware, async (req, res) => {
  res.json({ success: false, error: "Coming in Phase 6" });
});

module.exports = router;