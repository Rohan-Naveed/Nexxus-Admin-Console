const service = require("./fines.service");

async function listTypes(req, res) {
  res.json(await service.fetchAllTypes());
}

async function listFines(req, res) {
  const { dispatcherId } = req.query;
  if (dispatcherId) {
    return res.json(await service.fetchForDispatcher(dispatcherId));
  }
  res.json(await service.fetchAll());
}

async function createFine(req, res) {
  res.status(201).json(await service.create(req.body, req.user.email));
}

async function updateFine(req, res) {
  res.json(await service.update(req.params.id, req.body, req.user.email));
}

async function deleteFine(req, res) {
  res.json(await service.remove(req.params.id));
}

module.exports = { listTypes, listFines, createFine, updateFine, deleteFine };
