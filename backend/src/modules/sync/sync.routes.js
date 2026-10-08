const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./sync.controller");

// Mounted at /api/sync behind requireAdmin (see app.js).
const router = express.Router();

router.get("/status", asyncHandler(controller.status)); // ?year=&month=
router.get("/summary", asyncHandler(controller.summary));
router.get("/history", asyncHandler(controller.history)); // ?dispatcherId=&year=&month=&source=&status=&page=&pageSize=
router.post("/run", asyncHandler(controller.run)); // { dispatcherIds: [..]|"all", year, month, weeks: [..]|"all" }
router.get("/runs/:runId", asyncHandler(controller.runProgress));

module.exports = router;
