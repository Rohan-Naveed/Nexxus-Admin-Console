const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./rates.controller");

const router = express.Router();

router.get("/usd-pkr", asyncHandler(controller.listUsdRates));
router.get("/usd-pkr/latest", asyncHandler(controller.latestUsdRate));
router.post("/usd-pkr", asyncHandler(controller.upsertUsdRate));

router.get("/tax", asyncHandler(controller.listTaxRates));
router.get("/tax/latest", asyncHandler(controller.latestTaxRate));
router.post("/tax", asyncHandler(controller.upsertTaxRate));

router.get("/tracking", asyncHandler(controller.trackingProperties));
router.put("/tracking", asyncHandler(controller.updateTrackingProperties));

module.exports = router;
