const express       = require("express");
const router        = express.Router();
const appCtrl       = require("../controllers/applicationController");
const uploadCtrl    = require("../controllers/uploadController");
const verifyToken   = require("../middleware/verifyToken");
const upload        = require("../middleware/upload");

// All routes require a valid JWT
router.post("/save",  verifyToken, appCtrl.saveValidation, appCtrl.saveApplication);
router.get("/get",    verifyToken, appCtrl.getApplication);

// File upload — accepts resume (1), photo (1), idProof (1)
router.post(
  "/upload-documents",
  verifyToken,
  upload.fields([
    { name: "resume",  maxCount: 1 },
    { name: "photo",   maxCount: 1 },
    { name: "idProof", maxCount: 1 },
  ]),
  uploadCtrl.uploadDocuments
);

// Serve a stored document (authenticated)
router.get("/document/:filename", verifyToken, uploadCtrl.serveDocument);

module.exports = router;