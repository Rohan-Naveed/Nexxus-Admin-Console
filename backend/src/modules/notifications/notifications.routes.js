const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const service = require("./notifications.service");

// Mounted at /api/notifications behind requireAdmin (see app.js).
const router = express.Router();
router.get("/", asyncHandler(async (req, res) => res.json(await service.getNotifications())));

module.exports = router;
