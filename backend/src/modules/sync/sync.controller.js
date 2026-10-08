const service = require("./sync.service");
const { ApiError } = require("../../middleware/errorHandler");

function requireYearMonth(query) {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "year and month are required (month 1-12).");
  }
  return { year, month };
}

async function status(req, res) {
  const { year, month } = requireYearMonth(req.query);
  res.json(await service.getStatus(year, month));
}

async function summary(req, res) {
  res.json(await service.getSummary());
}

async function history(req, res) {
  res.json(await service.getHistory(req.query));
}

// Returns immediately with a run id; the UI polls GET /runs/:runId.
async function run(req, res) {
  const started = await service.startManualRun(req.body || {}, req.user);
  res.status(202).json(started);
}

async function runProgress(req, res) {
  res.json(service.getRun(req.params.runId));
}

module.exports = { status, summary, history, run, runProgress };
