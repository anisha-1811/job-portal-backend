// controllers/jobsController.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Job Listings
// Uses hardcoded seed data so the feature works without a separate DB table.
// When you're ready for a real DB, see the DB NOTE at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

// ── Seed Data ─────────────────────────────────────────────────────────────────
const JOBS = [
  {
    id: "job_001",
    title: "Frontend Developer",
    company: "TechNova Solutions",
    location: "Bangalore, India",
    type: "Full-time",
    mode: "Hybrid",
    experience: "0–2 years",
    salary: "₹4–8 LPA",
    posted_at: "2026-05-20",
    deadline: "2026-06-15",
    description:
      "We are looking for a Frontend Developer to join our product team. You will build responsive, accessible React applications and collaborate with designers and backend engineers.",
    requirements: [
      "Proficiency in React.js and JavaScript (ES6+)",
      "Experience with REST APIs and Axios",
      "Familiarity with Tailwind CSS or styled-components",
      "Basic understanding of Git and version control",
    ],
    skills: ["React", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Git", "REST API"],
    category: "Engineering",
    logo: "🖥️",
  },
  {
    id: "job_002",
    title: "Full Stack Developer",
    company: "BridgeWorks Pvt Ltd",
    location: "Pune, India",
    type: "Full-time",
    mode: "Remote",
    experience: "1–3 years",
    salary: "₹6–12 LPA",
    posted_at: "2026-05-22",
    deadline: "2026-06-20",
    description:
      "Join our growing team to build scalable SaaS products. You'll own features end-to-end, from API design to polished UI. Stack: Node.js + React + MySQL.",
    requirements: [
      "Strong Node.js and Express.js skills",
      "React frontend experience",
      "MySQL or PostgreSQL database design",
      "REST API development and integration",
      "Git workflow (branching, PRs, code review)",
    ],
    skills: ["Node.js", "React", "Express", "MySQL", "JavaScript", "REST API", "Git"],
    category: "Engineering",
    logo: "⚙️",
  },
  {
    id: "job_003",
    title: "Data Analyst",
    company: "InsightEdge Analytics",
    location: "Hyderabad, India",
    type: "Full-time",
    mode: "On-site",
    experience: "0–2 years",
    salary: "₹3–6 LPA",
    posted_at: "2026-05-18",
    deadline: "2026-06-10",
    description:
      "Turn raw data into business intelligence. You'll work with cross-functional teams to create dashboards, run SQL queries, and generate weekly reports.",
    requirements: [
      "SQL proficiency (JOINs, window functions, subqueries)",
      "Experience with Excel or Google Sheets",
      "Familiarity with Power BI or Tableau",
      "Basic Python (pandas, matplotlib) is a plus",
    ],
    skills: ["SQL", "Excel", "Python", "Power BI", "Data Visualization", "Statistics"],
    category: "Data",
    logo: "📊",
  },
  {
    id: "job_004",
    title: "UI/UX Designer",
    company: "PixelCraft Studio",
    location: "Mumbai, India",
    type: "Full-time",
    mode: "Hybrid",
    experience: "1–3 years",
    salary: "₹5–9 LPA",
    posted_at: "2026-05-21",
    deadline: "2026-06-18",
    description:
      "Design elegant user experiences for our B2B SaaS platform. Work closely with product and engineering to ship designs that are beautiful and functional.",
    requirements: [
      "Proficiency in Figma",
      "Strong portfolio demonstrating UX thinking",
      "Experience designing web and mobile interfaces",
      "Basic HTML/CSS to communicate with developers",
    ],
    skills: ["Figma", "UI Design", "UX Research", "Prototyping", "HTML", "CSS", "User Testing"],
    category: "Design",
    logo: "🎨",
  },
  {
    id: "job_005",
    title: "Backend Developer (Node.js)",
    company: "CloudStack Systems",
    location: "Chennai, India",
    type: "Full-time",
    mode: "Remote",
    experience: "1–4 years",
    salary: "₹7–14 LPA",
    posted_at: "2026-05-23",
    deadline: "2026-06-25",
    description:
      "Build high-performance backend services powering our cloud infrastructure platform. You will design APIs, optimize queries, and ensure 99.9% uptime.",
    requirements: [
      "Node.js with Express or Fastify",
      "MySQL and Redis experience",
      "REST API design and documentation",
      "JWT authentication and security best practices",
      "Docker and basic DevOps",
    ],
    skills: ["Node.js", "Express", "MySQL", "Redis", "Docker", "REST API", "JWT", "Security"],
    category: "Engineering",
    logo: "🔧",
  },
  {
    id: "job_006",
    title: "Machine Learning Engineer",
    company: "Neuro Labs AI",
    location: "Bangalore, India",
    type: "Full-time",
    mode: "Hybrid",
    experience: "2–5 years",
    salary: "₹12–22 LPA",
    posted_at: "2026-05-19",
    deadline: "2026-06-12",
    description:
      "Build production ML pipelines and deploy models at scale. You'll work on NLP and computer vision problems with our research team.",
    requirements: [
      "Python expertise (PyTorch or TensorFlow)",
      "ML fundamentals: regression, classification, NLP, CNNs",
      "MLOps experience (model versioning, deployment)",
      "AWS or GCP cloud ML services",
    ],
    skills: ["Python", "PyTorch", "TensorFlow", "NLP", "Machine Learning", "MLOps", "AWS", "SQL"],
    category: "AI/ML",
    logo: "🤖",
  },
  {
    id: "job_007",
    title: "DevOps Engineer",
    company: "Rapid Deploy Co.",
    location: "Delhi, India",
    type: "Full-time",
    mode: "Remote",
    experience: "2–4 years",
    salary: "₹10–18 LPA",
    posted_at: "2026-05-24",
    deadline: "2026-06-28",
    description:
      "Manage CI/CD pipelines, Kubernetes clusters, and cloud infrastructure. You'll be the reliability champion for 50+ microservices.",
    requirements: [
      "Kubernetes and Docker expertise",
      "CI/CD tools (GitHub Actions, Jenkins)",
      "AWS/GCP infrastructure management",
      "Terraform for infrastructure as code",
      "Monitoring with Prometheus and Grafana",
    ],
    skills: ["Kubernetes", "Docker", "AWS", "GCP", "Terraform", "CI/CD", "Linux", "Python"],
    category: "Engineering",
    logo: "🚀",
  },
  {
    id: "job_008",
    title: "Business Analyst",
    company: "StratCore Consulting",
    location: "Gurgaon, India",
    type: "Full-time",
    mode: "On-site",
    experience: "0–3 years",
    salary: "₹4–9 LPA",
    posted_at: "2026-05-17",
    deadline: "2026-06-08",
    description:
      "Bridge the gap between business stakeholders and technology teams. You'll gather requirements, create process flows, and ensure projects deliver real value.",
    requirements: [
      "Requirement gathering and documentation",
      "Proficiency in MS Excel and PowerPoint",
      "Basic SQL for data querying",
      "Experience creating user stories and wireframes",
    ],
    skills: ["Business Analysis", "SQL", "Excel", "Agile", "JIRA", "Documentation", "Communication"],
    category: "Business",
    logo: "📋",
  },
];

// ── GET ALL JOBS ──────────────────────────────────────────────────────────────
// GET /api/jobs?search=react&category=Engineering&mode=Remote&type=Full-time
exports.getAllJobs = async (req, res) => {
  try {
    const { search = "", category = "", mode = "", type = "" } = req.query;

    let filtered = [...JOBS];

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.skills.some((s) => s.toLowerCase().includes(q)) ||
          j.description.toLowerCase().includes(q)
      );
    }

    if (category) filtered = filtered.filter((j) => j.category === category);
    if (mode)     filtered = filtered.filter((j) => j.mode === mode);
    if (type)     filtered = filtered.filter((j) => j.type === type);

    return res.json({
      success: true,
      total: filtered.length,
      data: filtered,
    });
  } catch (err) {
    console.error("getAllJobs error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch jobs." });
  }
};

// ── GET SINGLE JOB ────────────────────────────────────────────────────────────
exports.getJobById = async (req, res) => {
  const job = JOBS.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, error: "Job not found." });
  res.json({ success: true, data: job });
};

// ── GET FILTER OPTIONS ────────────────────────────────────────────────────────
exports.getFilters = async (req, res) => {
  res.json({
    success: true,
    data: {
      categories: [...new Set(JOBS.map((j) => j.category))].sort(),
      modes: [...new Set(JOBS.map((j) => j.mode))].sort(),
      types: [...new Set(JOBS.map((j) => j.type))].sort(),
    },
  });
};

/*
──────────────────────────────────────────────────────────────────────────────
DB NOTE (for later when you want a real MySQL jobs table):
──────────────────────────────────────────────────────────────────────────────
Run this SQL to create the table:

CREATE TABLE jobs (
  id             VARCHAR(50)  PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  company        VARCHAR(200) NOT NULL,
  location       VARCHAR(200),
  type           VARCHAR(50),
  mode           VARCHAR(50),
  experience     VARCHAR(100),
  salary         VARCHAR(100),
  description    TEXT,
  requirements   JSON,
  skills         JSON,
  category       VARCHAR(100),
  logo           VARCHAR(10),
  posted_at      DATE,
  deadline       DATE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

Then replace the JOBS array with db.execute() queries.
──────────────────────────────────────────────────────────────────────────────
*/