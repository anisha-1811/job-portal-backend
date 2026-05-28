// routes/jobs.js — Phase 4 Job Listings
const express   = require("express");
const router    = express.Router();
const jobsCtrl  = require("../controllers/jobsController");

// GET /api/jobs          — list all jobs (with optional filters)
router.get("/", jobsCtrl.getAllJobs);

// GET /api/jobs/filters  — return unique category/mode/type options for dropdowns
router.get("/filters", jobsCtrl.getFilters);

// GET /api/jobs/:id      — single job detail
router.get("/:id", jobsCtrl.getJobById);

module.exports = router;