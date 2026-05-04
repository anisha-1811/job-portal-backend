const express      = require("express");
const router       = express.Router();
const appCtrl      = require("../controllers/applicationController");
const verifyToken  = require("../middleware/verifyToken");

// All routes below require a valid JWT token
router.post("/save",   verifyToken, appCtrl.saveApplication);
router.get("/get",     verifyToken, appCtrl.getApplication);

module.exports = router;