const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./dispatchers.controller");

const router = express.Router();

router.get("/", asyncHandler(controller.listDispatchers));
router.get("/unlinked-sheets", asyncHandler(controller.listUnlinkedSheets));
router.get("/:id", asyncHandler(controller.getDispatcher));
router.post("/", asyncHandler(controller.createDispatcher));
router.put("/:id", asyncHandler(controller.updateDispatcher));
router.delete("/:id", asyncHandler(controller.deleteDispatcher));

module.exports = router;
