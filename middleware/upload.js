const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

// Store in /tmp/uploads (works on Render free tier; persists for the session)
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // e.g. 42_resume_1717600000000.pdf
    const applicantId = req.applicant_id || "unknown";
    const ts          = Date.now();
    const ext         = path.extname(file.originalname).toLowerCase();
    cb(null, `${applicantId}_${file.fieldname}_${ts}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error(`File type ${ext} not allowed`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

module.exports = upload;