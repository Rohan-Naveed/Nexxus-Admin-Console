const service = require("./salarySlips.service");

async function listSlips(req, res) {
  const { dispatcherId } = req.query;
  if (dispatcherId) {
    return res.json(await service.fetchForDispatcher(dispatcherId));
  }
  res.json(await service.fetchAll());
}

async function listHistory(req, res) {
  res.json(await service.fetchHistory());
}

async function getOne(req, res, next) {
  const { ApiError } = require("../../middleware/errorHandler");
  const { dispatcherId, year, month } = req.params;
  const slip = await service.fetchOne(
    dispatcherId,
    Number(year),
    Number(month),
  );
  if (!slip) {
    return next(new ApiError(404, "No slip found for that dispatcher/period."));
  }
  res.json(slip);
}

async function generateSlip(req, res) {
  const slip = await service.generate(req.body, req.user.email);
  res.status(201).json(slip);
}

async function sendSlipEmail(req, res) {
  const slip = await service.sendSlipEmail(
    req.params.id,
    req.body?.pdfBase64,
    req.user.email,
  );
  res.json(slip);
}

async function deleteSlip(req, res) {
  res.json(await service.remove(req.params.id));
}

module.exports = {
  listSlips,
  listHistory,
  getOne,
  generateSlip,
  sendSlipEmail,
  deleteSlip,
};
