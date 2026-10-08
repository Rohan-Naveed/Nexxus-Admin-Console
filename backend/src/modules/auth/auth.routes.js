const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const { requireAuth } = require("../../middleware/auth");
const controller = require("./auth.controller");

const router = express.Router();

router.post("/signup", asyncHandler(controller.signup));
router.post("/login", asyncHandler(controller.login));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", requireAuth, asyncHandler(controller.me));

module.exports = router;
