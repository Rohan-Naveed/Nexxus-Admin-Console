// Splits a period total (Monthly -> weeks, Yearly -> months) into
// sub-period rows for the Payroll breakdown tables.
//
// The Google Sheets sync only exposes one gross/payroll figure per period
// today — there's no per-week or per-month figure to read directly. So
// gross and salary here are ESTIMATED by spreading the period total across
// the sub-periods that have already started, weighted by days elapsed in
// each. Expenses use real recorded entries wherever they exist (see
// src/data/expenses.js + src/utils/expenseCalc.js) and only fall back to
// the same weighted estimate for sub-periods with no recorded entry yet.
// Replace the estimate with real per-week/per-month figures once the sync
// (or DB) tracks them directly — the `estimated` flag on each row marks
// which numbers are estimates.

import {
  getMonthWeekChunks,
  getPeriodMonth,
  chunkContains,
  chunkReached,
  chunkElapsedDays,
  MONTH_NAMES,
  formatRange,
} from "./periods";
import { getMonthKey, summarizeMonth } from "./expenseCalc";

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

// null when nothing at all was recorded for that month (so the caller can
// fall back to an estimate), otherwise the real weekly-cadence total
// (dinner + miscellaneous) plus any monthly bills entered for that month.
function realMonthExpenseTotal(monthKey, entries) {
  const hasAnyEntry = entries.some((entry) => getMonthKey(entry.date) === monthKey);
  if (!hasAnyEntry) return null;
  return summarizeMonth(monthKey, entries).total;
}

// Weekly breakdown of the current month (used when Payroll's period is
// "Monthly"). Expenses per week use the real dinner/miscellaneous entries
// already recorded; gross/salary are estimated.
export function getMonthlyWeeklyBreakdown({
  monthlyGross,
  monthlyPayroll,
  entries = [],
  today = new Date(),
}) {
  // The "current month" is the month today's week is labelled with.
  const { year, monthIndex } = getPeriodMonth(today);
  const chunks = getMonthWeekChunks(year, monthIndex);
  const monthSummary = summarizeMonth(monthKeyOf(year, monthIndex), entries);

  const weights = chunks.map((c) => chunkElapsedDays(c, today));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  return chunks.map((c, i) => {
    const reached = chunkReached(c, today);
    const share = weights[i] / totalWeight;
    const gross = reached ? Math.round(monthlyGross * share) : 0;
    const salary = reached ? Math.round(monthlyPayroll * share) : 0;
    const week = monthSummary.weeks[i];
    const expenses = reached ? week.total : 0;

    return {
      key: `week-${c.weekNumber}`,
      label: `Week ${c.weekNumber}`,
      rangeLabel: formatRange(c.start, c.end),
      reached,
      current: chunkContains(c, today),
      gross,
      salary,
      expenses,
      profit: gross - salary - expenses,
      estimated: true,
    };
  });
}

// Monthly breakdown of the current year (used when Payroll's period is
// "Yearly"). Uses real recorded expense totals for any month with at least
// one entry; everything else (gross, salary, and expenses for months with
// no recorded entry) is estimated from the yearly totals.
export function getYearlyMonthlyBreakdown({
  yearlyGross,
  yearlyPayroll,
  yearlyExpenses,
  entries = [],
  today = new Date(),
}) {
  const year = today.getFullYear();
  const currentMonthIndex = today.getMonth();
  const day = today.getDate();

  const weights = MONTH_NAMES.map((_, idx) => {
    const daysInMonth = new Date(year, idx + 1, 0).getDate();
    if (idx < currentMonthIndex) return daysInMonth;
    if (idx > currentMonthIndex) return 0;
    return day;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  const realTotalsByIdx = MONTH_NAMES.map((_, idx) =>
    realMonthExpenseTotal(monthKeyOf(year, idx), entries),
  );
  const knownExpenseTotal = realTotalsByIdx.reduce((sum, v) => sum + (v ?? 0), 0);
  const remainingExpenses = Math.max((yearlyExpenses ?? 0) - knownExpenseTotal, 0);
  const unknownReachedWeight = MONTH_NAMES.reduce((sum, _, idx) => {
    if (idx > currentMonthIndex || realTotalsByIdx[idx] != null) return sum;
    return sum + weights[idx];
  }, 0) || 1;

  return MONTH_NAMES.map((label, idx) => {
    const reached = idx <= currentMonthIndex;
    const share = weights[idx] / totalWeight;
    const gross = reached ? Math.round(yearlyGross * share) : 0;
    const salary = reached ? Math.round(yearlyPayroll * share) : 0;

    const realExpenses = realTotalsByIdx[idx];
    let expenses = 0;
    let estimated = true;
    if (reached) {
      if (realExpenses != null) {
        expenses = realExpenses;
        estimated = false;
      } else {
        expenses = Math.round(remainingExpenses * (weights[idx] / unknownReachedWeight));
      }
    }

    return {
      key: `month-${idx}`,
      label,
      shortLabel: label.slice(0, 3),
      reached,
      current: idx === currentMonthIndex,
      gross,
      salary,
      expenses,
      profit: gross - salary - expenses,
      estimated,
    };
  });
}
