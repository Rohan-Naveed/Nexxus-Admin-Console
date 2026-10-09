const service = require("./expenses.service");

async function listCategories(req, res) {
  res.json(await service.fetchAllCategories(req.query.activeOnly === "true"));
}

async function createCategory(req, res) {
  res.status(201).json(await service.createCategory(req.body));
}

async function updateCategory(req, res) {
  res.json(await service.updateCategory(req.params.key, req.body));
}

async function archiveCategory(req, res) {
  res.json(await service.archiveCategory(req.params.key));
}

async function deleteCategory(req, res) {
  res.json(await service.deleteCategory(req.params.key));
}

async function listExpenses(req, res) {
  const { from, to } = req.query;
  if (from && to) {
    return res.json(await service.fetchByDateRange(from, to));
  }
  res.json(await service.fetchAll());
}

async function createExpense(req, res) {
  res.status(201).json(await service.create(req.body, req.user.email));
}

async function updateExpense(req, res) {
  res.json(await service.update(req.params.id, req.body, req.user.email));
}

async function deleteExpense(req, res) {
  res.json(await service.remove(req.params.id));
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  deleteCategory,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
