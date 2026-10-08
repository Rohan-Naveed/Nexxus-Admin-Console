// Pure calculation helpers for the flat fine/deduction entry list in
// src/data/fines.js. Nothing here holds state — every function takes the
// entries it needs and returns a plain object, so the same helpers work
// operate on fine entries loaded from the backend API.

import {
  chunkContains,
  getMonthWeekChunks,
  getPeriodMonth,
  getWeekOfMonth,
} from "./periods";
import { getMonthKey, getMonthLabel, sortByDateDesc } from "./expenseCalc";

export { getMonthKey, getMonthLabel };

// Every distinct month present in the fine list, newest first.
export function getAllFineMonthKeys(fines) {
  const keys = new Set(fines.map((f) => getMonthKey(f.date)));
  return [...keys].sort().reverse();
}

// "Week 2 · 11 Aug 2026" style label for a fine's date.
export function getWeekDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const weekNumber = getWeekOfMonth(d);
  const dayLabel = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Week ${weekNumber} \u00b7 ${dayLabel}`;
}

// Everything the Deductions tab needs to render one month: fines grouped
// by dispatcher (each with its own total and entries, newest first).
export function summarizeFinesMonth(monthKey, allFines, dispatchers = []) {
  const nameById = new Map(dispatchers.map((d) => [d.id, d.alias || d.name]));
  const entries = sortByDateDesc(
    allFines.filter((f) => getMonthKey(f.date) === monthKey),
  );

  const byDispatcher = new Map();
  for (const entry of entries) {
    if (!byDispatcher.has(entry.dispatcherId)) {
      byDispatcher.set(entry.dispatcherId, {
        dispatcherId: entry.dispatcherId,
        dispatcherName: nameById.get(entry.dispatcherId) ?? entry.dispatcherId,
        entries: [],
        total: 0,
      });
    }
    const group = byDispatcher.get(entry.dispatcherId);
    group.entries.push(entry);
    group.total += entry.amount;
  }

  const groups = [...byDispatcher.values()].sort((a, b) => b.total - a.total);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return {
    monthKey,
    label: getMonthLabel(monthKey),
    entries,
    groups,
    total,
  };
}

// Late/violation/other totals for one dispatcher in one month — this is
// what src/utils/slipCalc.js draws on so a salary slip's deduction fields
// come straight from the Deductions database instead of being retyped
// by hand.
export function getFinesBreakdownForDispatcherMonth(
  dispatcherId,
  monthKey,
  allFines,
) {
  const entries = allFines.filter(
    (f) => f.dispatcherId === dispatcherId && getMonthKey(f.date) === monthKey,
  );

  const breakdown = { late: 0, violation: 0, other: 0, total: 0, entries };
  for (const entry of entries) {
    const key = breakdown[entry.type] === undefined ? "other" : entry.type;
    breakdown[key] += entry.amount;
    breakdown.total += entry.amount;
  }
  return breakdown;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getFineTotalsForPeriod(period, allFines, today = new Date()) {
  const monthKey = getMonthKey(today);
  const year = monthKey.slice(0, 4);
  let weekStart = null;
  let weekEnd = null;

  if (period === "Weekly") {
    const currentMonth = getPeriodMonth(today);
    const currentWeek = getMonthWeekChunks(
      currentMonth.year,
      currentMonth.monthIndex,
    ).find((chunk) => chunkContains(chunk, today));
    if (currentWeek) {
      weekStart = dateKey(currentWeek.start);
      weekEnd = dateKey(currentWeek.end);
    }
  }

  const totals = new Map();
  for (const fine of allFines) {
    const fineDate = String(fine.date ?? "").slice(0, 10);
    const fineMonth = getMonthKey(fineDate);
    const matchesPeriod =
      period === "Weekly"
        ? weekStart !== null && fineDate >= weekStart && fineDate <= weekEnd
        : period === "Yearly"
          ? fineMonth.startsWith(`${year}-`)
          : fineMonth === monthKey;

    if (!matchesPeriod) continue;
    const id = String(fine.dispatcherId);
    totals.set(id, (totals.get(id) ?? 0) + Number(fine.amount || 0));
  }

  return totals;
}
