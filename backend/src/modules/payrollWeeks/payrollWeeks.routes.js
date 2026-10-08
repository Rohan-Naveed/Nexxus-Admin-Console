const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./payrollWeeks.controller");

const router = express.Router();

router.get("/", asyncHandler(controller.listAll)); // every synced week (USD)
router.get("/totals/monthly", asyncHandler(controller.monthlyTotals)); // ?year=&month=
router.get("/totals/yearly", asyncHandler(controller.yearlyTotals)); // ?year=
router.get("/dispatcher/:dispatcherId", asyncHandler(controller.listForDispatcher));
router.get(
  "/dispatcher/:dispatcherId/:year/:month",
  asyncHandler(controller.listForDispatcherMonth),
);
// NOTE: the old public POST /sync route was removed on purpose — syncing is
// done by the sync core (see modules/sync) reading the Google Sheet.
router.delete("/:id", asyncHandler(controller.deleteWeek));

module.exports = router;
