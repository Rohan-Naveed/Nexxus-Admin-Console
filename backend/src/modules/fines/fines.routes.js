const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./fines.controller");

const router = express.Router();

router.get("/types", asyncHandler(controller.listTypes));
router.get("/", asyncHandler(controller.listFines)); // ?dispatcherId= optional
router.post("/", asyncHandler(controller.createFine));
router.put("/:id", asyncHandler(controller.updateFine));
router.delete("/:id", asyncHandler(controller.deleteFine));

module.exports = router;
