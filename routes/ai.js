// routes/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// All Gemini-powered AI endpoints.
// Every route is protected by verifyToken (same JWT middleware used elsewhere).
//
// Endpoints:
//   POST /api/ai/generate-resume
//   POST /api/ai/ats-score
//   POST /api/ai/job-match
//   POST /api/ai/cover-letter
//   POST /api/ai/mock-interview
//   POST /api/ai/skill-gap
// ─────────────────────────────────────────────────────────────────────────────

const express     = require("express");
const router      = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const verifyToken = require("../middleware/verifyToken");
const multer      = require("multer");

// ── Gemini client (initialised once, reused across requests) ──────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use gemini-1.5-flash — fastest free-tier model
const getModel = () => genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ── Multer — in-memory storage for resume uploads (Phase 3 ATS) ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only PDF, DOCX, or TXT files are accepted."));
  },
});

// ── Shared utility: call Gemini and parse JSON response ───────────────────────
async function callGemini(prompt) {
  const model  = getModel();
  const result = await model.generateContent(prompt);
  const raw    = result.response.text();

  // Strip markdown fences if the model accidentally adds them
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-resort: grab the first {...} or [...] block
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) return JSON.parse(match[1]);
    throw new Error("Gemini returned malformed JSON. Please try again.");
  }
}

// Truncate large text so we stay within sensible token limits on free tier
function truncate(text, maxChars = 4000) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated for analysis]";
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — AI Resume Generator
// POST /api/ai/generate-resume
// Body: { formData } — ApplicationPage formData object
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/generate-resume
router.post("/generate-resume", verifyToken, async (req, res) => {
  try {
    const {
      fullName, email, phone, location, linkedin, github,
      summary, targetRole, tone = "professional",
      skillsList = [], experiences = [],
      internshipsList = [], projectsList = [], certsList = []
    } = req.body;

    const prompt = `
You are an expert resume writer specializing in ATS-optimized, ${tone} resumes.

Generate a complete, polished resume for this candidate and return ONLY valid JSON — no markdown, no code fences, no explanation.

Candidate Details:
- Name: ${fullName}
- Email: ${email}
- Phone: ${phone}
- Location: ${location}
- LinkedIn: ${linkedin || "N/A"}
- GitHub: ${github || "N/A"}
- Target Role: ${targetRole || "Not specified"}
- Existing Summary: ${summary || "None provided"}

Skills: ${skillsList.filter(Boolean).join(", ")}

Work Experience:
${experiences.map((e, i) => `
  ${i + 1}. ${e.role} at ${e.company} (${e.duration})
  Details: ${e.description}
`).join("")}

Internships:
${internshipsList.length > 0 ? internshipsList.map((e, i) => `
  ${i + 1}. ${e.role} at ${e.company} (${e.duration})
  Details: ${e.description}
`).join("") : "None"}

Projects:
${projectsList.map((p, i) => `
  ${i + 1}. ${p.name} — Tech: ${p.tech}
  Details: ${p.description}
`).join("")}

Certifications:
${certsList.length > 0 ? certsList.map(c => `${c.name} by ${c.issuer} (${c.year})`).join(", ") : "None"}

Return this exact JSON structure (no extra fields, no markdown):
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin": "string",
  "github": "string",
  "summary": "2-3 sentence ${tone} professional summary enhanced by AI",
  "skills": ["skill1", "skill2", "...up to 15 skills"],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string",
      "bullets": ["action-verb achievement bullet 1", "bullet 2", "bullet 3"]
    }
  ],
  "internships": [
    {
      "company": "string",
      "role": "string",
      "duration": "string",
      "bullets": ["bullet 1", "bullet 2"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "tech": "string",
      "bullets": ["what it does", "your contribution", "impact or outcome"]
    }
  ],
  "certifications": [
    { "name": "string", "issuer": "string", "year": "string" }
  ]
}

Rules:
- Bullets must start with strong action verbs (Developed, Implemented, Optimized, Led, Built...)
- Quantify achievements wherever possible even if estimated (e.g., "Reduced load time by ~30%")
- Make the summary compelling and tailored to the target role
- Keep skills to real, relevant ones only
- ATS-friendly: no tables, no graphics, clean structure
`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    // Strip any accidental markdown fences
    const cleanText = rawText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let resumeData;
    try {
      resumeData = JSON.parse(cleanText);
    } catch {
      // Fallback: return raw text if JSON parse fails
      resumeData = { rawText: cleanText };
    }

    res.json({ success: true, data: resumeData });
  } catch (error) {
    console.error("Resume generation error:", error);
    res.status(500).json({ success: false, error: "Failed to generate resume" });
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — ATS Score Checker
// POST /api/ai/ats-score
// Body: multipart/form-data — resume (file) + jobDescription (string, optional)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/ats-score", verifyToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Resume file is required." });
    }

    // Extract text from the uploaded file buffer
    // For PDF/DOCX: Gemini can read the raw bytes via inline data
    const jobDescription = req.body.jobDescription || "";
    const mimeType       = req.file.mimetype;
    const fileBuffer     = req.file.buffer;

    const model = getModel();

    // Build the content parts — send file as inline data to Gemini
    const filePart = {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType,
      },
    };

    const textPart = `
You are a senior ATS (Applicant Tracking System) analyst.
Analyse the resume${jobDescription ? " against the provided job description" : ""}.

${jobDescription ? `JOB DESCRIPTION:\n${truncate(jobDescription, 2000)}` : ""}

Return ONLY this JSON (no markdown, no preamble):
{
  "score": <integer 0-100>,
  "grade": "<A|B|C|D|F>",
  "errors": ["formatting or structural issue 1", "..."],
  "suggestions": ["most impactful fix first", "..."],
  "keywordMatches": ["keyword from JD found in resume"],
  "missingKeywords": ["important JD keyword NOT in resume"],
  "sectionScores": {
    "contact":    <0-20>,
    "summary":    <0-20>,
    "experience": <0-20>,
    "skills":     <0-20>,
    "education":  <0-20>
  }
}`.trim();

    const result  = await model.generateContent([textPart, filePart]);
    const raw     = result.response.text();
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/(\{[\s\S]*\})/);
      parsed = match ? JSON.parse(match[1]) : { score: 0, grade: "F", errors: ["Parse error"], suggestions: [] };
    }

    res.json({ success: true, ...parsed });

  } catch (err) {
    console.error("❌ /ats-score error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — AI Job Matching
// POST /api/ai/job-match
// Body: { formData, jobListings[] }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/job-match", verifyToken, async (req, res) => {
  try {
    const { formData, jobListings } = req.body;
    if (!formData || !Array.isArray(jobListings) || jobListings.length === 0) {
      return res.status(400).json({ success: false, message: "formData and jobListings[] are required." });
    }

    const profile = {
      skills:      formData.skillsList     || [],
      degree:      `${formData.degree} in ${formData.branch}`,
      experience:  (formData.experiences   || []).map(e => `${e.role} at ${e.company}`),
      internships: (formData.internshipsList || []).map(i => `${i.role} at ${i.company}`),
      projects:    (formData.projectsList  || []).map(p => p.title),
    };

    const prompt = `
You are a career advisor. Rank these job listings by fit for this candidate.

CANDIDATE:
${JSON.stringify(profile, null, 2)}

JOB LISTINGS:
${JSON.stringify(jobListings, null, 2)}

Return ONLY a JSON array sorted by matchScore descending:
[
  {
    "jobId": "<id from listing>",
    "matchScore": <0-100>,
    "matchReasons": ["reason 1", "reason 2"],
    "missingSkills": ["skill candidate lacks"],
    "applyRecommendation": "<strong|moderate|stretch>"
  }
]
No markdown. No preamble.`.trim();

    const data = await callGemini(prompt);
    // Ensure it's sorted best → worst
    const sorted = Array.isArray(data)
      ? data.sort((a, b) => b.matchScore - a.matchScore)
      : [];

    res.json({ success: true, matches: sorted });

  } catch (err) {
    console.error("❌ /job-match error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Cover Letter Generator
// POST /api/ai/cover-letter
// Body: { formData, jobDetails, tone }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/cover-letter", verifyToken, async (req, res) => {
  try {
    const { formData, jobDetails, tone = "professional" } = req.body;
    if (!formData || !jobDetails) {
      return res.status(400).json({ success: false, message: "formData and jobDetails are required." });
    }

    const name       = `${formData.firstName || ""} ${formData.lastName || ""}`.trim();
    const skills     = (formData.skillsList || []).slice(0, 10).join(", ");
    const topProject = (formData.projectsList || [])[0];

    const prompt = `
You are an expert career coach. Write a compelling cover letter.

CANDIDATE:
Name: ${name}
Degree: ${formData.degree} in ${formData.branch} from ${formData.institution}
Key Skills: ${skills}
Strongest Project: ${topProject ? topProject.title + " — " + (topProject.description || "") : "N/A"}

JOB:
Title: ${jobDetails.title}
Company: ${jobDetails.company}
Hiring Manager: ${jobDetails.hiringManager || "Hiring Manager"}
Description: ${truncate(jobDetails.description, 1500)}

Tone: ${tone}

Rules:
- 3 paragraphs: strong hook → evidence of value → call to action.
- Under 350 words.
- Do NOT open with "I am writing to apply for…"
- Mirror key phrases from the JD naturally.
- Sign off with the candidate's name.

Return ONLY JSON:
{
  "coverLetter": "full letter text, use \\n for newlines",
  "wordCount": <integer>
}`.trim();

    const data = await callGemini(prompt);
    res.json({ success: true, ...data });

  } catch (err) {
    console.error("❌ /cover-letter error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Mock Interview Prep
// POST /api/ai/mock-interview
// Body: { role, level, skills[], interviewType }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mock-interview", verifyToken, async (req, res) => {
  try {
    const { role, level = "mid", skills = [], interviewType = "mixed" } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, message: "role is required." });
    }

    const prompt = `
Generate 10 realistic ${interviewType} interview questions for a ${level}-level ${role}.
Focus on: ${skills.slice(0, 8).join(", ") || "general software engineering"}.

Return ONLY a JSON array:
[
  {
    "question": "...",
    "modelAnswer": "A strong 2-3 sentence answer a ${level} candidate would give.",
    "tips": ["preparation tip 1", "tip 2"]
  }
]
No markdown. No preamble.`.trim();

    const data = await callGemini(prompt);
    const questions = Array.isArray(data) ? data : [];
    res.json({ success: true, questions });

  } catch (err) {
    console.error("❌ /mock-interview error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Skill Gap Analysis
// POST /api/ai/skill-gap
// Body: { currentSkills[], targetRole, jobDescription }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/skill-gap", verifyToken, async (req, res) => {
  try {
    const { currentSkills = [], targetRole, jobDescription = "" } = req.body;
    if (!targetRole) {
      return res.status(400).json({ success: false, message: "targetRole is required." });
    }

    const prompt = `
Analyse the skill gap for this candidate targeting the given role.

Current skills: ${currentSkills.join(", ") || "None listed"}
Target role: ${targetRole}
${jobDescription ? `Job description:\n${truncate(jobDescription, 1500)}` : ""}

Return ONLY JSON:
{
  "missingSkills": ["skill they need to learn"],
  "partialSkills": ["skill they have but need to strengthen"],
  "strongSkills": ["skills they already excel at for this role"],
  "learningResources": [
    { "skill": "...", "resource": "course or book name", "url": "https://..." }
  ],
  "estimatedTimeToReady": "e.g. 2-3 months of focused study"
}
No markdown. No preamble.`.trim();

    const data = await callGemini(prompt);
    res.json({ success: true, ...data });

  } catch (err) {
    console.error("❌ /skill-gap error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;