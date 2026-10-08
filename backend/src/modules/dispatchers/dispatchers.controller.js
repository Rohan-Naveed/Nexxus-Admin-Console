const dispatchersService = require("./dispatchers.service");

async function listDispatchers(req, res) {
  const dispatchers = await dispatchersService.fetchAll();
  res.json(dispatchers);
}

async function getDispatcher(req, res, next) {
  const { ApiError } = require("../../middleware/errorHandler");
  const dispatcher = await dispatchersService.fetchById(req.params.id);
  if (!dispatcher) {
    return next(new ApiError(404, `Dispatcher ${req.params.id} not found.`));
  }
  res.json(dispatcher);
}

async function listUnlinkedSheets(req, res) {
  const dispatchers = await dispatchersService.fetchUnlinkedSheets();
  res.json(dispatchers);
}

async function createDispatcher(req, res) {
  const dispatcher = await dispatchersService.create(req.body, req.user.email);
  res.status(201).json(dispatcher);
}

async function updateDispatcher(req, res) {
  const dispatcher = await dispatchersService.update(req.params.id, req.body, req.user.email);
  res.json(dispatcher);
}

async function deleteDispatcher(req, res) {
  const result = await dispatchersService.remove(req.params.id);
  res.json(result);
}

module.exports = {
  listDispatchers,
  getDispatcher,
  listUnlinkedSheets,
  createDispatcher,
  updateDispatcher,
  deleteDispatcher,
};
