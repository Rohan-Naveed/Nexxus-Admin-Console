const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./salarySlips.controller");

const router = express.Router();

router.get("/", asyncHandler(controller.listSlips)); // ?dispatcherId= optional
router.get("/history", asyncHandler(controller.listHistory));
router.get("/:dispatcherId/:year/:month", asyncHandler(controller.getOne));
router.post("/", asyncHandler(controller.generateSlip));
router.post("/:id/send", asyncHandler(controller.sendSlipEmail));
router.delete("/:id", asyncHandler(controller.deleteSlip));

module.exports = router;
