const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./calendar.controller");

// Mounted at /api/calendar behind requireAdmin (see app.js).
const router = express.Router();

router.get("/", asyncHandler(controller.get));
router.get("/weeks", asyncHandler(controller.all));
router.put("/", asyncHandler(controller.save));

module.exports = router;
