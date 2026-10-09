const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const controller = require("./expenses.controller");

const router = express.Router();

router.get("/categories", asyncHandler(controller.listCategories));
router.post("/categories", asyncHandler(controller.createCategory));
router.put("/categories/:key", asyncHandler(controller.updateCategory));
router.delete("/categories/:key/permanent", asyncHandler(controller.deleteCategory));
router.delete("/categories/:key", asyncHandler(controller.archiveCategory));
router.get("/", asyncHandler(controller.listExpenses)); // ?from=&to= optional
router.post("/", asyncHandler(controller.createExpense));
router.put("/:id", asyncHandler(controller.updateExpense));
router.delete("/:id", asyncHandler(controller.deleteExpense));

module.exports = router;
