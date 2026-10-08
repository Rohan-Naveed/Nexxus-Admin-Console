const service = require("./payrollWeeks.service");

async function listAll(req, res) {
  res.json(await service.fetchAllSynced());
}

async function listForDispatcher(req, res) {
  const weeks = await service.fetchForDispatcher(req.params.dispatcherId);
  res.json(weeks);
}

async function listForDispatcherMonth(req, res) {
  const { dispatcherId, year, month } = req.params;
  const weeks = await service.fetchForDispatcherMonth(dispatcherId, Number(year), Number(month));
  res.json(weeks);
}

async function monthlyTotals(req, res) {
  const { year, month } = req.query;
  const totals = await service.fetchMonthlyTotals(Number(year), Number(month));
  res.json(totals);
}

async function yearlyTotals(req, res) {
  const { year } = req.query;
  const totals = await service.fetchYearlyTotals(Number(year));
  res.json(totals);
}

async function deleteWeek(req, res) {
  const result = await service.remove(req.params.id);
  res.json(result);
}

module.exports = {
  listAll,
  listForDispatcher,
  listForDispatcherMonth,
  monthlyTotals,
  yearlyTotals,
  deleteWeek,
};
