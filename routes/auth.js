const express  = require("express");
const router   = express.Router();
const authCtrl = require("../controllers/authController");

// Firebase UID → JWT  (existing flow: email/password + Google)
router.post("/login", authCtrl.loginValidation, authCtrl.loginOrRegister);

// API ID + Password → JWT  (new flow for returning users)
router.post("/login-by-id", authCtrl.loginByApiIdValidation, authCtrl.loginByApiId);

module.exports = router;