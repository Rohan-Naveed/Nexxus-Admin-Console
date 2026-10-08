// Derives Payroll's breakdown table for whichever period is selected —
// last 4 weeks (Weekly), last 6 months (Monthly), last 5 years
// (Yearly) — from WEEKLY_GROSS_HISTORY / YEARLY_GROSS_HISTORY in
// src/data/payrollHistory.js.
//
// GROSS IS STORED IN USD (as in the sheet) and converted to PKR with the
// rate of the month each week belongs to — see src/data/payrollHistory.js.
// Every figure below is PKR unless a function says USD.
//
// Every row's gross is real synced data (or `null`/omitted where the
// sync hasn't reached that week/month/year yet — see `reached` below).
// Salary is RECOMPUTED from that gross using each dispatcher's current
// commission % and base salary (src/data/dispatchers.js) — the same
// figures the rest of the app already applies for the selected period.
// That's a simplification worth flagging: it assumes today's rate also
// applied in the past. Once payroll rules are tracked with effective
// dates, swap that lookup for the rate that was actually in effect for
// each period instead of always using "current". Expenses use the real
// recorded entries wherever they exist (src/utils/expenseCalc.js) and
// are 0 for periods with nothing recorded yet — never fabricated.
//
// TODO(backend): once the sync service + DB from src/data/payrollHistory.js
// are real, only the two imports below need to change — everything else
// here keeps working as-is.
//
// GOOGLE SHEETS TODO — see /GOOGLE_SHEETS_TODO.md at the project root.

import {
  WEEKLY_GROSS_HISTORY,
  WEEKLY_GROSS_USD,
  WEEKLY_TRACKING_HISTORY,
  WEEKLY_TRACKING_USD,
  WEEKLY_GROSS_PERCENTAGES,
  WEEKLY_TRACKING_PERCENTAGES,
  YEARLY_GROSS_HISTORY,
} from "../data/payrollHistory";
import {
  getMonthWeekChunks,
  getMonthWeekCountByKey,
  getPeriodMonth,
  getEndedCalendarWeeks,
  chunkContains,
  formatRange,
} from "./periods";
import {
  getMonthKey,
  getMonthLabel,
  getAllMonthKeys,
  summarizeMonth,
} from "./expenseCalc";

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function salaryFor(dispatcher, gross, periodKey) {
  const base = dispatcher.basicSalary?.[periodKey] ?? 0;
  const commission = gross * (dispatcher.percentage ?? 0);
  return base + commission;
}

function employeeActiveInMonth(employee, monthKey) {
  const joined = employee.profile?.joinedDate?.slice(0, 7);
  const left = employee.profile?.leftDate?.slice(0, 7);
  return (!joined || monthKey >= joined) && (!left || monthKey <= left);
}

function employeeMonthsInYear(employee, year) {
  const start = employee.profile?.joinedDate
    ? new Date(`${employee.profile.joinedDate.slice(0, 10)}T00:00:00`)
    : new Date(year, 0, 1);
  const end = employee.profile?.leftDate
    ? new Date(`${employee.profile.leftDate.slice(0, 10)}T00:00:00`)
    : new Date();
  if (start.getFullYear() > year || end.getFullYear() < year) return 0;
  const firstMonth = start.getFullYear() === year ? start.getMonth() : 0;
  const lastMonth = end.getFullYear() === year ? end.getMonth() : 11;
  return Math.max(0, lastMonth - firstMonth + 1);
}

// Weekly breakdown of the CURRENT month's 4 weeks — shown when Payroll's
// period is "Weekly". Weeks the sync hasn't reached yet come back as
// `reached: false` rows (see CURRENT_MONTH_WEEKS_SYNCED in
// src/data/payrollHistory.js).
export function getWeeklyTrendBreakdown({
  dispatchers,
  expenseEntries = [],
  today = new Date(),
}) {
  // The "current month" is the month today's week is labelled with.
  const period = getPeriodMonth(today);
  const monthKey = monthKeyOf(period.year, period.monthIndex);
  const chunks = getMonthWeekChunks(period.year, period.monthIndex);
  const monthExpenses = summarizeMonth(monthKey, expenseEntries);

  return chunks.map((chunk, i) => {
    const weekField = `week${chunk.weekNumber}`;
    let gross = 0;
    let trackingFees = 0;
    let dispatcherSalary = 0;
    let fixedSalary = 0;
    const truckDispatchers = dispatchers.filter(
      (employee) => employee.employeeType !== "employee",
    );
    const fixedEmployees = dispatchers.filter(
      (employee) => employee.employeeType === "employee",
    );
    let synced = truckDispatchers.length > 0;

    truckDispatchers.forEach((dispatcher) => {
      const weekGross =
        WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey]?.[weekField];
      if (weekGross == null) {
        synced = false;
        return;
      }
      gross += weekGross;
      trackingFees +=
        WEEKLY_TRACKING_HISTORY[dispatcher.id]?.[monthKey]?.[weekField] ?? 0;
      dispatcherSalary += salaryFor(dispatcher, weekGross, "Weekly");
    });
    let fixedSalaryReached = false;
    fixedEmployees.forEach((employee) => {
      if (!employeeActiveInMonth(employee, monthKey)) return;
      fixedSalaryReached = true;
      fixedSalary += employee.basicSalary?.Weekly ?? 0;
    });

    const expenses = monthExpenses.weeks[i]?.total ?? 0;

    return {
      key: `week-${chunk.weekNumber}`,
      label: `Week ${chunk.weekNumber}`,
      rangeLabel: formatRange(chunk.start, chunk.end),
      reached: synced || fixedSalaryReached,
      current: chunkContains(chunk, today),
      gross: synced ? gross : 0,
      trackingFees,
      salary: (synced ? dispatcherSalary : 0) + fixedSalary,
      expenses: synced || fixedSalaryReached ? expenses : 0,
      profit:
        synced || fixedSalaryReached
          ? (synced ? gross : 0) +
            trackingFees -
            ((synced ? dispatcherSalary : 0) + fixedSalary) -
            expenses
          : 0,
    };
  });
}

// Trend across the last `monthsBack` months (oldest first) — shown when
// Payroll's period is "Monthly". A month's gross is the sum of whichever
// weeks have synced for it; `partial: true` flags a month still missing
// one or more weeks (only ever the current, in-progress month today).
export function getMonthlyTrendBreakdown({
  dispatchers,
  expenseEntries = [],
  monthsBack = 6,
  today = new Date(),
}) {
  const keys = [];
  // Start from the month today's week is labelled with (see periods.js).
  const currentPeriod = getPeriodMonth(today);
  let year = currentPeriod.year;
  let monthIndex = currentPeriod.monthIndex;
  for (let i = 0; i < monthsBack; i += 1) {
    keys.push(monthKeyOf(year, monthIndex));
    monthIndex -= 1;
    if (monthIndex < 0) {
      monthIndex = 11;
      year -= 1;
    }
  }
  keys.reverse(); // oldest -> newest, so the table reads left-to-right as a trend

  const currentMonthKey = monthKeyOf(
    currentPeriod.year,
    currentPeriod.monthIndex,
  );

  return keys.map((monthKey) => {
    let gross = 0;
    let trackingFees = 0;
    let salary = 0;
    let anyWeekSynced = false;
    const truckDispatchers = dispatchers.filter(
      (employee) => employee.employeeType !== "employee",
    );
    const fixedEmployees = dispatchers.filter(
      (employee) => employee.employeeType === "employee",
    );
    let allWeeksSynced = truckDispatchers.length > 0;
    const weekCount = getMonthWeekCountByKey(monthKey);

    truckDispatchers.forEach((dispatcher) => {
      const weeks = WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey];
      const known = weeks ? Object.values(weeks).filter((v) => v != null) : [];
      if (known.length === 0) {
        allWeeksSynced = false;
        return;
      }
      anyWeekSynced = true;
      if (known.length < weekCount) allWeeksSynced = false;
      const monthGross = known.reduce((sum, v) => sum + v, 0);
      gross += monthGross;
      const trackingWeeks =
        WEEKLY_TRACKING_HISTORY[dispatcher.id]?.[monthKey] ?? {};
      trackingFees += Object.entries(weeks).reduce(
        (sum, [weekField, value]) =>
          value == null ? sum : sum + (trackingWeeks[weekField] ?? 0),
        0,
      );
      // Base salary pro-rated by how much of the month has synced, so a
      // partially-synced current month doesn't overstate salary.
      const base =
        (dispatcher.basicSalary?.Monthly ?? 0) * (known.length / weekCount);
      salary += base + monthGross * (dispatcher.percentage ?? 0);
    });
    let fixedSalaryReached = false;
    fixedEmployees.forEach((employee) => {
      if (!employeeActiveInMonth(employee, monthKey)) return;
      fixedSalaryReached = true;
      salary += employee.basicSalary?.Monthly ?? 0;
    });

    const expenses = summarizeMonth(monthKey, expenseEntries).total;

    return {
      key: `month-${monthKey}`,
      label: getMonthLabel(monthKey),
      shortLabel: getMonthLabel(monthKey).split(" ")[0].slice(0, 3),
      reached: anyWeekSynced || fixedSalaryReached,
      current: monthKey === currentMonthKey,
      partial: anyWeekSynced && !allWeeksSynced,
      gross,
      trackingFees,
      salary,
      expenses,
      profit: gross + trackingFees - salary - expenses,
    };
  });
}

// Trend across the last `yearsBack` years (oldest first) — shown when
// Payroll's period is "Yearly". Empty until payroll history is loaded
// from the backend.
export function getYearlyTrendBreakdown({
  dispatchers,
  expenseEntries = [],
  yearsBack = 5,
  today = new Date(),
}) {
  const years = Array.from(
    { length: yearsBack },
    (_, i) => today.getFullYear() - (yearsBack - 1 - i),
  );

  return years.map((year) => {
    let gross = 0;
    let trackingFees = 0;
    let salary = 0;
    const truckDispatchers = dispatchers.filter(
      (employee) => employee.employeeType !== "employee",
    );
    const fixedEmployees = dispatchers.filter(
      (employee) => employee.employeeType === "employee",
    );
    let known = truckDispatchers.length > 0;

    truckDispatchers.forEach((dispatcher) => {
      const yearGross = YEARLY_GROSS_HISTORY[dispatcher.id]?.[year];
      if (yearGross == null) {
        known = false;
        return;
      }
      gross += yearGross;
      Object.entries(WEEKLY_TRACKING_HISTORY[dispatcher.id] ?? {}).forEach(
        ([monthKey, weeks]) => {
          if (monthKey.startsWith(`${year}-`)) {
            trackingFees += Object.values(weeks).reduce(
              (sum, fee) => sum + (fee ?? 0),
              0,
            );
          }
        },
      );
      salary += salaryFor(dispatcher, yearGross, "Yearly");
    });
    const fixedSalaryReached = fixedEmployees.some(
      (employee) => employeeMonthsInYear(employee, year) > 0,
    );
    fixedEmployees.forEach((employee) => {
      salary +=
        (employee.basicSalary?.Monthly ?? 0) *
        employeeMonthsInYear(employee, year);
    });

    const expenses = getAllMonthKeys(expenseEntries)
      .filter((key) => key.startsWith(String(year)))
      .reduce((sum, key) => sum + summarizeMonth(key, expenseEntries).total, 0);

    return {
      key: `year-${year}`,
      label: String(year),
      reached: known || fixedSalaryReached,
      current: year === today.getFullYear(),
      gross,
      trackingFees,
      salary,
      expenses,
      profit: gross + trackingFees - salary - expenses,
    };
  });
}

export { getMonthKey };

// ---------------------------------------------------------------------
// Salary Slips eligibility + historical gross lookups.
//
// These read the same WEEKLY_GROSS_HISTORY table as the breakdown
// functions above, so "which months can we generate a slip for" and
// "what did this dispatcher actually gross that month" both come from
// one source of truth instead of being guessed independently.
//
// TODO(backend): once payroll_weeks is a real table, swap these for
// queries — e.g. getAvailableSlipMonthKeys() becomes
// `SELECT DISTINCT month_key FROM payroll_weeks ORDER BY month_key DESC`,
// and getMonthGrossUsd() becomes a per-dispatcher/month row lookup. The
// Salary Slips UI only calls these two functions (plus
// isCurrentSyncingMonth), so nothing else needs to change.
// ---------------------------------------------------------------------

// Month keys eligible for slip generation, newest first — every month
// for which AT LEAST ONE dispatcher has some synced gross data. Months
// with nothing synced at all (e.g. before the sync/DB existed) are left
// out entirely rather than offered as a dead dropdown option.
export function getAvailableSlipMonthKeys(
  employees = [],
  slips = [],
  today = new Date(),
) {
  const keys = new Set();
  Object.values(WEEKLY_GROSS_HISTORY).forEach((byMonth) => {
    Object.entries(byMonth).forEach(([monthKey, weeks]) => {
      if (Object.values(weeks).some((v) => v != null)) keys.add(monthKey);
    });
  });
  slips.forEach((slip) => {
    if (slip.monthKey) keys.add(slip.monthKey);
  });
  const currentKey = monthKeyOf(today.getFullYear(), today.getMonth());
  employees
    .filter((employee) => employee.employeeType === "employee")
    .forEach((employee) => {
      const joined = employee.profile?.joinedDate;
      if (!joined) {
        keys.add(currentKey);
        return;
      }
      const start = new Date(`${joined.slice(0, 10)}T00:00:00`);
      for (
        let year = start.getFullYear();
        year <= today.getFullYear();
        year += 1
      ) {
        const firstMonth = year === start.getFullYear() ? start.getMonth() : 0;
        const lastMonth = year === today.getFullYear() ? today.getMonth() : 11;
        for (let month = firstMonth; month <= lastMonth; month += 1) {
          keys.add(monthKeyOf(year, month));
        }
      }
    });
  return [...keys].sort().reverse();
}

// Whether `monthKey` is the current, still-in-progress calendar month —
// used to label it "in progress" in the month picker regardless of
// which dispatcher is being looked at.
export function isCurrentSyncingMonth(monthKey, today = new Date()) {
  const period = getPeriodMonth(today);
  return monthKey === monthKeyOf(period.year, period.monthIndex);
}

// The newest eligible month that ISN'T still in progress, if one
// exists — i.e. the most recent fully-closed-out month, which is almost
// always what an admin is running payroll for. Falls back to the newest
// eligible month if nothing else qualifies (e.g. very first month of
// data). Used as the Salary Slips tab's default selection instead of
// hardcoding "last calendar month", so it degrades gracefully as the
// real sync's available months change.
export function getDefaultSlipMonthKey(today = new Date()) {
  const keys = getAvailableSlipMonthKeys();
  const completed = keys.find((key) => !isCurrentSyncingMonth(key, today));
  return completed ?? keys[0] ?? null;
}

// Gross (USD, exactly as synced from the sheet) for one dispatcher in
// one month, and how many of the month's weeks that covers.
// `hasAnyData: false` means this dispatcher has nothing synced for this
// month at all (not on the roster yet, or already gone) — the Slips UI
// uses that to hide the generate form instead of building a slip from
// nothing. `isPartial: true` means some but not all weeks are in — the UI
// still allows generating (e.g. for a dispatcher leaving mid-month, or
// the current month still syncing) but flags it clearly.
export function getMonthGrossUsd(dispatcherId, monthKey) {
  const weeks = WEEKLY_GROSS_USD[dispatcherId]?.[monthKey];
  const known = weeks ? Object.values(weeks).filter((v) => v != null) : [];
  const totalWeeks = getMonthWeekCountByKey(monthKey);
  return {
    total: known.reduce((sum, v) => sum + v, 0),
    syncedWeeks: known.length,
    totalWeeks,
    hasAnyData: known.length > 0,
    isPartial: known.length > 0 && known.length < totalWeeks,
  };
}

// ---------------------------------------------------------------------
// Headline gross per dispatcher (PKR) for the Weekly / Monthly / Yearly
// filters, from the synced weeks:
//
//   Weekly  = the most recent COMPLETED week. Weeks are only synced after
//             they end, so the week in progress never has data yet.
//   Monthly = weeks synced so far for the month today's week belongs to.
//   Yearly  = weeks synced so far this year (by the weeks' month labels).
//
// `lastGross` is the period before: the week before that, last month,
// last year — or null when nothing was synced for it.
// ---------------------------------------------------------------------
function sumWeeks(weeksByField) {
  const known = weeksByField
    ? Object.values(weeksByField).filter((v) => v != null)
    : [];
  return known.length > 0 ? known.reduce((sum, v) => sum + v, 0) : null;
}

export function getDispatcherGrossFigures(dispatcherId, today = new Date()) {
  const byMonth = WEEKLY_GROSS_HISTORY[dispatcherId] ?? {};
  const trackingByMonth = WEEKLY_TRACKING_HISTORY[dispatcherId] ?? {};
  const ended = getEndedCalendarWeeks(today);
  const weekValue = (week) =>
    week
      ? (WEEKLY_GROSS_HISTORY[dispatcherId]?.[
          `${week.year}-${String(week.monthIndex + 1).padStart(2, "0")}`
        ]?.[`week${week.weekNumber}`] ?? null)
      : null;
  const trackingWeekValue = (week) =>
    week
      ? (WEEKLY_TRACKING_HISTORY[dispatcherId]?.[
          `${week.year}-${String(week.monthIndex + 1).padStart(2, "0")}`
        ]?.[`week${week.weekNumber}`] ?? null)
      : null;

  const lastWeek = ended[ended.length - 1];
  const weekBefore = ended[ended.length - 2];

  const period = getPeriodMonth(today);
  const thisMonth = monthKeyOf(period.year, period.monthIndex);
  const prevIndex = period.monthIndex === 0 ? 11 : period.monthIndex - 1;
  const prevYear = period.monthIndex === 0 ? period.year - 1 : period.year;
  const lastMonth = monthKeyOf(prevYear, prevIndex);

  const yearSum = (year) => {
    const keys = Object.keys(byMonth).filter((k) => k.startsWith(`${year}-`));
    const parts = keys
      .map((k) => sumWeeks(byMonth[k]))
      .filter((v) => v != null);
    return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const trackingYearSum = (year) => {
    const keys = Object.keys(trackingByMonth).filter((key) =>
      key.startsWith(`${year}-`),
    );
    const parts = keys
      .map((key) => sumWeeks(trackingByMonth[key]))
      .filter((value) => value != null);
    return parts.length > 0
      ? parts.reduce((sum, value) => sum + value, 0)
      : null;
  };

  return {
    gross: {
      Weekly: weekValue(lastWeek) ?? 0,
      Monthly: sumWeeks(byMonth[thisMonth]) ?? 0,
      Yearly: yearSum(period.year) ?? 0,
    },
    lastGross: {
      Weekly: weekValue(weekBefore),
      Monthly: sumWeeks(byMonth[lastMonth]),
      Yearly: yearSum(period.year - 1),
    },
    trackingFee: {
      Weekly: trackingWeekValue(lastWeek) ?? 0,
      Monthly: sumWeeks(trackingByMonth[thisMonth]) ?? 0,
      Yearly: trackingYearSum(period.year) ?? 0,
    },
  };
}
