const service = require("./expenses.service");

async function listCategories(req, res) {
  res.json(await service.fetchAllCategories());
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

module.exports = { listCategories, listExpenses, createExpense, updateExpense, deleteExpense };
