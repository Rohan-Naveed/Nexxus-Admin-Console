// The Week Calendar: the admin decides how many weeks each month has and
// the start/end date of every week. Everything week-related (the sync
// scheduler, the Sync Center, and the console screens) reads from here.
//
// A month with no rows is "not set": nothing is synced for it and the
// notification centre tells the admin to set it.

const pool = require("../../db/pool");
const { dbQuery } = require("../../db/helpers");
const queries = require("../../../config/db.json").calendarWeeks;
const config = require("../../../config/config.json");
const logger = require("../../logger/logger");
const { ApiError } = require("../../middleware/errorHandler");
const wc = require("../../utils/weekCalendar");

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthKeyOf = (year, month) => year * 100 + month;
const monthLabel = (year, month) => `${MONTH_NAMES[month - 1]} ${year}`;

function toWeek(row) {
  return {
    id: row.id,
    year: row.period_year,
    month: row.period_month,
    weekNumber: row.week_number,
    start: row.start_date,
    end: row.end_date,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

// ---- reads used by the rest of the backend ----------------------------

async function getWeeksOfMonth(year, month) {
  const rows = await dbQuery(
    queries.selectMonth,
    [year, month],
    "calendarWeeks.selectMonth",
  );
  return rows.map(toWeek);
}

// Every ended week (end date before today), oldest first. The scheduler
// uses this: months with nothing set simply don't appear.
async function getEndedWeeks(now = new Date()) {
  const rows = await dbQuery(
    queries.selectEnded,
    [wc.todayInTimezone(now)],
    "calendarWeeks.selectEnded",
  );
  return rows.map(toWeek);
}

async function getAllWeeks() {
  const rows = await dbQuery(queries.selectAll, [], "calendarWeeks.selectAll");
  return rows.map(toWeek);
}

async function requireWeekForDate(date) {
  if (!wc.isValidDateKey(date)) {
    throw new ApiError(400, "date must be a valid date in YYYY-MM-DD format.");
  }
  const week = (await getAllWeeks()).find(
    (w) => date >= w.start && date <= w.end,
  );
  if (!week) {
    throw new ApiError(
      400,
      `No configured week covers ${date}. Set its date range in the Week Calendar before recording an expense or fine.`,
    );
  }
  return week;
}

async function getSyncedKeys() {
  const rows = await dbQuery(
    queries.syncedWeeks,
    [],
    "calendarWeeks.syncedWeeks",
  );
  return new Set(
    rows.map((r) => `${r.period_year}-${r.period_month}-${r.week_number}`),
  );
}

// ---- API read model ----------------------------------------------------

// Weeks for every month from `fromKey` ("YYYY-MM") through `toKey`, each
// week flagged with ended / locked. Months that have nothing set are
// returned with weeks: [] so the UI can show "Not set".
async function getCalendar(fromKey, toKey) {
  const from = wc.parseMonthKey(fromKey);
  const to = wc.parseMonthKey(toKey);
  if (![from.year, from.month, to.year, to.month].every(Number.isInteger)) {
    throw new ApiError(400, "from and to must look like YYYY-MM.");
  }
  const rows = await dbQuery(
    queries.selectRange,
    [monthKeyOf(from.year, from.month), monthKeyOf(to.year, to.month)],
    "calendarWeeks.selectRange",
  );
  const synced = await getSyncedKeys();
  const now = new Date();
  const byMonth = new Map();
  rows.map(toWeek).forEach((w) => {
    const key = `${w.year}-${w.month}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    const ended = wc.isWeekEnded(w, now);
    byMonth.get(key).push({
      weekNumber: w.weekNumber,
      startDate: w.start,
      endDate: w.end,
      ended,
      synced: synced.has(`${w.year}-${w.month}-${w.weekNumber}`),
      // Ended AND synced: frozen, since the synced total depends on it.
      locked: ended && synced.has(`${w.year}-${w.month}-${w.weekNumber}`),
    });
  });

  const months = [];
  let y = from.year;
  let m = from.month;
  while (monthKeyOf(y, m) <= monthKeyOf(to.year, to.month)) {
    const weeks = byMonth.get(`${y}-${m}`) || [];
    months.push({ year: y, month: m, isSet: weeks.length > 0, weeks });
    ({ year: y, month: m } = wc.nextMonthOf({ year: y, month: m }));
  }
  return {
    today: wc.todayInTimezone(now),
    timezone: config.sync.timezone,
    months,
  };
}

// ---- saving ------------------------------------------------------------

function fail(message) {
  return new ApiError(400, message);
}

// Validates the FULL proposed calendar (existing months untouched by the
// request + the months being saved) and the locking rules.
function validate({ proposed, existing, synced, now }) {
  const maxWeeks = config.calendar.maxWeeksPerMonth;
  const maxDays = config.calendar.maxWeekDays;
  const today = wc.todayInTimezone(now);

  // 1. Per-month checks
  const monthKeys = [...proposed.keys()].sort((a, b) => a - b);
  for (const mk of monthKeys) {
    const { year, month, weeks } = proposed.get(mk);
    const label = monthLabel(year, month);
    if (weeks.length === 0) continue;
    if (weeks.length > maxWeeks)
      throw fail(`${label}: a month can have at most ${maxWeeks} weeks.`);

    weeks.forEach((w, i) => {
      if (w.weekNumber !== i + 1) {
        throw fail(`${label}: weeks must be numbered 1, 2, 3… with no gaps.`);
      }
      if (!wc.isValidDateKey(w.start) || !wc.isValidDateKey(w.end)) {
        throw fail(
          `${label}, Week ${w.weekNumber}: start and end must be valid dates (YYYY-MM-DD).`,
        );
      }
      if (w.end < w.start) {
        throw fail(
          `${label}, Week ${w.weekNumber}: the end date is before the start date.`,
        );
      }
      if (wc.diffDays(w.start, w.end) + 1 > maxDays) {
        throw fail(
          `${label}, Week ${w.weekNumber}: a week can't be longer than ${maxDays} days.`,
        );
      }
      if (i > 0 && w.start !== wc.addDays(weeks[i - 1].end, 1)) {
        throw fail(
          `${label}: Week ${w.weekNumber} must start the day after Week ${i} ends (${wc.addDays(weeks[i - 1].end, 1)}).`,
        );
      }
    });
  }

  // 2. Across months: ordered, no overlap, no gap between neighbours
  for (let i = 1; i < monthKeys.length; i += 1) {
    const prev = proposed.get(monthKeys[i - 1]);
    const next = proposed.get(monthKeys[i]);
    if (prev.weeks.length === 0 || next.weeks.length === 0) continue;
    const prevEnd = prev.weeks[prev.weeks.length - 1].end;
    const nextStart = next.weeks[0].start;
    const adjacent =
      wc.nextMonthOf({ year: prev.year, month: prev.month }).year ===
        next.year &&
      wc.nextMonthOf({ year: prev.year, month: prev.month }).month ===
        next.month;
    if (nextStart <= prevEnd) {
      throw fail(
        `${monthLabel(next.year, next.month)} Week 1 starts on ${nextStart}, which overlaps ${monthLabel(prev.year, prev.month)} (its last week ends ${prevEnd}).`,
      );
    }
    if (adjacent && nextStart !== wc.addDays(prevEnd, 1)) {
      throw fail(
        `${monthLabel(next.year, next.month)} Week 1 must start on ${wc.addDays(prevEnd, 1)}, the day after ${monthLabel(prev.year, prev.month)} ends.`,
      );
    }
  }

  // 3. Locks and edit rules for weeks that already exist
  for (const old of existing) {
    const mk = monthKeyOf(old.year, old.month);
    const target = proposed.get(mk);
    if (!target) continue; // month not part of the change
    const label = `${monthLabel(old.year, old.month)}, Week ${old.weekNumber}`;
    const now2 = target.weeks.find((w) => w.weekNumber === old.weekNumber);
    const ended = old.end < today;
    const isSynced = synced.has(`${old.year}-${old.month}-${old.weekNumber}`);

    if (ended && isSynced) {
      if (!now2 || now2.start !== old.start || now2.end !== old.end) {
        throw fail(
          `${label} has ended and been synced, so its dates can't be changed.`,
        );
      }
      continue;
    }
    if (!now2) continue; // removing an unlocked week is allowed
  }
}

// body.months: [{ year, month, weeks: [{ weekNumber, startDate, endDate }] }]
// A month with weeks: [] is cleared (back to "not set").
async function saveMonths(months, user) {
  if (!Array.isArray(months) || months.length === 0) {
    throw fail("months must be a non-empty list.");
  }
  const now = new Date();
  const existing = await getAllWeeks();
  const synced = await getSyncedKeys();

  // proposed = untouched existing months + the months in this request
  const proposed = new Map();
  existing.forEach((w) => {
    const mk = monthKeyOf(w.year, w.month);
    if (!proposed.has(mk))
      proposed.set(mk, { year: w.year, month: w.month, weeks: [] });
    proposed
      .get(mk)
      .weeks.push({ weekNumber: w.weekNumber, start: w.start, end: w.end });
  });

  const touched = [];
  for (const entry of months) {
    const year = Number(entry.year);
    const month = Number(entry.month);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw fail("Each month needs a valid year and month (1-12).");
    }
    const mk = monthKeyOf(year, month);
    if (touched.includes(mk))
      throw fail(`${monthLabel(year, month)} appears twice in the request.`);
    touched.push(mk);
    const weeks = (Array.isArray(entry.weeks) ? entry.weeks : [])
      .map((w) => ({
        weekNumber: Number(w.weekNumber),
        start: w.startDate,
        end: w.endDate,
      }))
      .sort((a, b) => a.weekNumber - b.weekNumber);
    proposed.set(mk, { year, month, weeks });
  }

  validate({ proposed, existing, synced, now });

  const email = user?.email || "unknown";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const mk of touched) {
      const { year, month, weeks } = proposed.get(mk);
      await client.query(queries.deleteMonth, [year, month]);
      for (const w of weeks) {
        await client.query(queries.insert, [
          year,
          month,
          w.weekNumber,
          w.start,
          w.end,
          email,
        ]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("Saving the week calendar failed", { error: err.message });
    if (err.code === "23P01") {
      throw fail("Those dates overlap another week that is already saved.");
    }
    throw err;
  } finally {
    client.release();
  }

  logger.info(`Week calendar saved by ${email}`, { months: touched });
  return { saved: touched.length };
}

module.exports = {
  getWeeksOfMonth,
  getEndedWeeks,
  getAllWeeks,
  requireWeekForDate,
  getCalendar,
  saveMonths,
  monthLabel,
};
