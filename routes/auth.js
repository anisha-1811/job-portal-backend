const express    = require("express");
const router     = express.Router();
const authCtrl   = require("../controllers/authController");

// POST /api/auth/login
router.post("/login", authCtrl.loginOrRegister);

module.exports = router;