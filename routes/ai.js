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

// ─── PHASE 6 — Cover Letter Generator ────────────────────────────────────────
// POST /api/ai/cover-letter
// Body: { formData: { firstName, lastName, skillsList, experiences, ... },
//         jobDetails: { title, company, description, hiringManager? },
//         tone: 'professional' | 'friendly' | 'enthusiastic' }

router.post("/cover-letter", authMiddleware, async (req, res) => {
  try {
    const { formData = {}, jobDetails = {}, tone = "professional" } = req.body;

    if (!jobDetails.title || !jobDetails.company) {
      return res.status(400).json({
        success: false,
        error: "jobDetails.title and jobDetails.company are required.",
      });
    }

    const candidateName =
      [formData.firstName, formData.lastName].filter(Boolean).join(" ") ||
      "Candidate";

    const toneGuide = {
      professional: "formal, precise, and authoritative — ideal for corporate or enterprise roles",
      friendly:
        "warm, personable, and conversational — ideal for startups and creative teams",
      enthusiastic:
        "energetic, passionate, and forward-looking — ideal for high-growth companies",
    }[tone] || "professional";

    const prompt = `
You are an expert career coach and professional cover letter writer.
Write a compelling, personalised cover letter for the candidate below.

TONE: ${toneGuide}

CANDIDATE PROFILE:
Name: ${candidateName}
Skills: ${(formData.skillsList || []).join(", ") || "Not provided"}
Work Experience: ${JSON.stringify(
      (formData.experiences || []).map((e) => ({
        role: e.role || e.company,
        company: e.company,
        description: e.description,
      })),
      null,
      2
    )}
Education: ${JSON.stringify(formData.degrees || [], null, 2)}
Projects: ${(formData.projectsList || [])
      .map((p) => p.title || p.name)
      .join(", ") || "Not provided"}

JOB DETAILS:
Title: ${jobDetails.title}
Company: ${jobDetails.company}
Hiring Manager: ${jobDetails.hiringManager || "Hiring Manager"}
Job Description:
${(jobDetails.description || "").slice(0, 1500)}

INSTRUCTIONS:
- 3 clear paragraphs: (1) opening + why this role, (2) specific achievements + skills match, (3) closing + call to action
- Opening: address "${jobDetails.hiringManager || "Hiring Manager"}" directly
- Each paragraph: 3-5 sentences, tight and impactful
- Weave in 2-3 specific skills from their profile that match the JD
- End with a confident call-to-action
- Do NOT use clichés like "I am writing to express..." or "I believe I am a perfect fit"
- Total length: 250-350 words

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "subject": "Application for ${jobDetails.title} – ${candidateName}",
  "salutation": "Dear ${jobDetails.hiringManager || "Hiring Manager"},",
  "paragraphs": ["paragraph1", "paragraph2", "paragraph3"],
  "closing": "Sincerely,\\n${candidateName}",
  "wordCount": <integer>
}`;

    const raw = await callGemini(prompt);
    const parsed = safeParseJSON(raw);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("cover-letter error:", err);
    res.status(500).json({ success: false, error: "Cover letter generation failed. Please try again." });
  }
});

// ─── PHASE 6 — Skill Gap Analyzer ────────────────────────────────────────────
// POST /api/ai/skill-gap
// Body: { currentSkills: string[], targetRole: string, jobDescription?: string }

router.post("/skill-gap", authMiddleware, async (req, res) => {
  try {
    const { currentSkills = [], targetRole, jobDescription = "" } = req.body;

    if (!targetRole || targetRole.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: "targetRole is required.",
      });
    }

    const prompt = `
You are an expert tech career coach and skills assessor.
Perform a detailed skill gap analysis for the candidate.

TARGET ROLE: ${targetRole}

CANDIDATE'S CURRENT SKILLS:
${currentSkills.length ? currentSkills.join(", ") : "None provided"}

${jobDescription ? `JOB DESCRIPTION:\n${jobDescription.slice(0, 1500)}` : ""}

Analyze thoroughly and return ONLY a valid JSON object (no markdown, no extra text):

{
  "overallReadiness": <integer 0-100, how ready they are for the target role>,
  "readinessLabel": "<Not Ready | Developing | Almost Ready | Job Ready>",
  "strongSkills": ["skill1", "skill2"],
  "partialSkills": [
    { "skill": "skill name", "gap": "what specifically is missing or needs deepening" }
  ],
  "missingSkills": [
    { "skill": "skill name", "priority": "high | medium | low", "reason": "why this matters for the role" }
  ],
  "learningPath": [
    {
      "skill": "skill name",
      "resource": "Specific course, book, or platform name",
      "type": "course | book | project | certification",
      "estimatedHours": <integer>,
      "url": "https://... (real URL if you know it, otherwise omit)"
    }
  ],
  "estimatedWeeksToReady": <integer>,
  "keyInsight": "One sentence summary of the biggest gap and how to close it fast",
  "quickWins": ["action 1 they can take this week", "action 2", "action 3"]
}

Scoring guide for overallReadiness:
- 80-100: Job Ready — strong overlap
- 60-79: Almost Ready — 1-2 key gaps
- 40-59: Developing — several gaps but solid foundation
- 0-39: Not Ready — major skills missing

Return the JSON object ONLY. No explanation text.`;

    const raw = await callGemini(prompt);
    const parsed = safeParseJSON(raw);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("skill-gap error:", err);
    res.status(500).json({ success: false, error: "Skill gap analysis failed. Please try again." });
  }
});

// ─── PHASE 6 — Mock Interview Generator ──────────────────────────────────────
// POST /api/ai/mock-interview
// Body: { role: string, level: string, skills: string[],
//         interviewType: 'technical'|'behavioural'|'mixed', numQuestions?: number }

router.post("/mock-interview", authMiddleware, async (req, res) => {
  try {
    const {
      role,
      level = "mid",
      skills = [],
      interviewType = "mixed",
      numQuestions = 8,
    } = req.body;

    if (!role || role.trim().length < 2) {
      return res.status(400).json({ success: false, error: "role is required." });
    }

    const count = Math.min(Math.max(parseInt(numQuestions) || 8, 4), 12);

    const prompt = `
You are a senior technical interviewer at a top tech company.
Generate ${count} realistic interview questions for the following candidate.

ROLE: ${role}
LEVEL: ${level} (junior = 0-2 yrs, mid = 2-5 yrs, senior = 5+ yrs)
INTERVIEW TYPE: ${interviewType}
CANDIDATE SKILLS: ${skills.length ? skills.join(", ") : "general"}

${
  interviewType === "technical"
    ? "Focus entirely on technical depth, coding concepts, system design, and problem-solving."
    : interviewType === "behavioural"
    ? "Focus on STAR-method behavioural questions about teamwork, conflict, leadership, and growth."
    : "Mix: 60% technical questions about their skills, 40% behavioural questions."
}

For each question, provide a model answer tailored to a ${level}-level candidate.

Return ONLY a valid JSON array (no markdown, no extra text):

[
  {
    "id": 1,
    "question": "The interview question",
    "type": "technical | behavioural | situational",
    "difficulty": "easy | medium | hard",
    "category": "e.g. React Hooks / System Design / Teamwork / etc.",
    "modelAnswer": "A thorough 3-5 sentence model answer appropriate for ${level} level",
    "tips": ["tip 1 to answer this well", "tip 2", "tip 3"],
    "followUp": "One likely follow-up question the interviewer might ask"
  }
]

Vary difficulty: ~30% easy, ~50% medium, ~20% hard.
Make questions specific to the candidate's skills where possible.
Return the array ONLY. No explanation text.`;

    const raw = await callGemini(prompt);
    const parsed = safeParseJSON(raw);
    res.json({ success: true, data: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    console.error("mock-interview error:", err);
    res.status(500).json({ success: false, error: "Mock interview generation failed. Please try again." });
  }
});

module.exports = router;