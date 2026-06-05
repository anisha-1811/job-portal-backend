const db = require("../config/db");
const fs = require("fs");

// POST /api/application/upload-documents
// Accepts multipart/form-data with fields: resume, photo, idProof
exports.uploadDocuments = async (req, res) => {
  try {
    const applicant_id = req.applicant_id;
    const files        = req.files || {};

    // Build update — only overwrite fields that were actually uploaded
    const updates = {};
    if (files.resume)  updates.resume_filename  = files.resume[0].filename;
    if (files.photo)   updates.photo_filename   = files.photo[0].filename;
    if (files.idProof) updates.id_proof_filename = files.idProof[0].filename;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No files received." });
    }

    // Fetch existing filenames so we can delete old files from disk
    const [existing] = await db.execute(
      `SELECT resume_filename, photo_filename, id_proof_filename
         FROM documents WHERE applicant_id = ?`,
      [applicant_id]
    );

    const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";

    const deleteOld = (oldName, newName) => {
      if (oldName && oldName !== newName) {
        const oldPath = `${UPLOAD_DIR}/${oldName}`;
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    };

    if (existing.length > 0) {
      const row = existing[0];
      if (updates.resume_filename)   deleteOld(row.resume_filename,   updates.resume_filename);
      if (updates.photo_filename)    deleteOld(row.photo_filename,    updates.photo_filename);
      if (updates.id_proof_filename) deleteOld(row.id_proof_filename, updates.id_proof_filename);
    }

    // Upsert documents row
    const cols   = Object.keys(updates);
    const setClauses = cols.map(c => `${c}=VALUES(${c})`).join(", ");
    await db.execute(
      `INSERT INTO documents (applicant_id, ${cols.join(", ")})
         VALUES (?, ${cols.map(() => "?").join(", ")})
         ON DUPLICATE KEY UPDATE ${setClauses}`,
      [applicant_id, ...Object.values(updates)]
    );

    return res.json({
      success:  true,
      message:  "Documents uploaded successfully.",
      uploaded: updates,
    });
  } catch (err) {
    console.error("uploadDocuments error:", err);
    return res.status(500).json({ success: false, message: "Upload failed." });
  }
};

// GET /api/application/document/:filename  — serve the actual file
exports.serveDocument = (req, res) => {
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";
  const filePath   = `${UPLOAD_DIR}/${req.params.filename}`;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "File not found." });
  }
  // Security: only serve files that belong to this applicant
  if (!req.params.filename.startsWith(`${req.applicant_id}_`)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }
  res.sendFile(filePath);
};