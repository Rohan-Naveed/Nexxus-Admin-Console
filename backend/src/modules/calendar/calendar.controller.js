const service = require("./calendar.service");
const wc = require("../../utils/weekCalendar");

// GET /api/calendar?from=2026-09&to=2027-02 (defaults: previous 3 months -> +6 months)
async function get(req, res) {
  const cur = wc.currentMonth();
  let from = cur;
  for (let i = 0; i < 3; i += 1) {
    from =
      from.month === 1
        ? { year: from.year - 1, month: 12 }
        : { year: from.year, month: from.month - 1 };
  }
  let end = cur;
  for (let i = 0; i < 6; i += 1) end = wc.nextMonthOf(end);
  const pad = (n) => String(n).padStart(2, "0");
  const fromKey = req.query.from || `${from.year}-${pad(from.month)}`;
  const to = req.query.to || `${end.year}-${pad(end.month)}`;
  res.json(await service.getCalendar(fromKey, to));
}

// GET /api/calendar/weeks — every saved week, for the console's date logic.
async function all(req, res) {
  const weeks = await service.getAllWeeks();
  res.json(
    weeks.map((w) => ({
      periodYear: w.year,
      periodMonth: w.month,
      weekNumber: w.weekNumber,
      startDate: w.start,
      endDate: w.end,
    })),
  );
}

// PUT /api/calendar  { months: [{ year, month, weeks: [{ weekNumber, startDate, endDate }] }] }
async function save(req, res) {
  res.json(await service.saveMonths(req.body?.months, req.user));
}

module.exports = { get, all, save };
