// Pure calculation helpers for the flat expense-entry list in
// src/data/expenses.js. Nothing here holds state — every function takes
// the entries it needs and returns a plain object, so the same helpers
// operate on expense entries loaded from the backend API.

import {
  MONTH_NAMES,
  getWeekOfMonth,
  getPeriodMonthKey,
  getMonthWeekChunks,
} from "./periods";
import { WEEKLY_CATEGORY_KEYS, MONTHLY_BILL_KEYS } from "../data/expenses";

// "2026-08-05" -> "2026-08". Accepts a Date or an ISO date string.
// The month a date COUNTS towards: the month its calendar week is labelled
// with (so Sep 29 can belong to "2026-10" if the admin set Sep 28 - Oct 4
// as Week 1 of October). Dates no week covers use their plain month.
export function getMonthKey(date) {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return getPeriodMonthKey(d);
}

// "2026-08" -> "August 2026"
export function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function sortByDateDesc(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1;
  });
}

// Every distinct month present in the entry list, newest first.
export function getAllMonthKeys(entries) {
  const keys = new Set(entries.map((e) => getMonthKey(e.date)));
  return [...keys].sort().reverse();
}

// Everything the Expenses tab needs to render one month: totals per
// category, a Week 1-4 breakdown for dinner/miscellaneous (each with its
// own entry list), and the monthly-bill entries on their own.
export function summarizeMonth(monthKey, allEntries) {
  const entries = allEntries.filter((e) => getMonthKey(e.date) === monthKey);

  const totals = {
    dinner: 0,
    miscellaneous: 0,
    electricity: 0,
    gas: 0,
    water: 0,
  };
  const [monthYear, monthNumber] = monthKey.split("-").map(Number);
  const weeks = getMonthWeekChunks(monthYear, monthNumber - 1).map((chunk) => ({
    weekNumber: chunk.weekNumber,
    dinner: 0,
    miscellaneous: 0,
    entries: [],
  }));
  const billEntries = [];

  for (const entry of entries) {
    totals[entry.category] = (totals[entry.category] ?? 0) + entry.amount;

    if (WEEKLY_CATEGORY_KEYS.includes(entry.category)) {
      const weekNumber = getWeekOfMonth(new Date(entry.date + "T00:00:00"));
      const week = weeks[weekNumber - 1] ?? weeks[weeks.length - 1];
      week[entry.category] += entry.amount;
      week.entries.push(entry);
    } else {
      billEntries.push(entry);
    }
  }

  weeks.forEach((week) => {
    week.entries = sortByDateDesc(week.entries);
    week.total = week.dinner + week.miscellaneous;
  });

  // Dinner is a monthly entry now, so it sits with the bills, not the weeks.
  const weeklyTotal = totals.miscellaneous;
  const billsTotal = MONTHLY_BILL_KEYS.reduce((sum, key) => sum + totals[key], 0);
  const missingMonthly = MONTHLY_BILL_KEYS.filter(
    (key) => !billEntries.some((entry) => entry.category === key),
  );

  return {
    monthKey,
    label: getMonthLabel(monthKey),
    entries: sortByDateDesc(entries),
    totals,
    weeks,
    billEntries: sortByDateDesc(billEntries),
    missingMonthly,
    weeklyTotal,
    billsTotal,
    total: weeklyTotal + billsTotal,
  };
}

// Kept for OverviewTab / PayrollTab, which only need a totals object for
// the currently-selected Weekly / Monthly / Yearly filter (they don't
// render individual entries). Utility bills never count toward Weekly —
// they're entered once a month, not per week.
export function getExpensesForPeriod(period, entries, today = new Date()) {
  const monthKey = getMonthKey(today);
  const month = summarizeMonth(monthKey, entries);

  if (period === "Weekly") {
    const weekNumber = getWeekOfMonth(today);
    const week = month.weeks[weekNumber - 1] ?? month.weeks[month.weeks.length - 1];
    return {
      dinner: week.dinner,
      miscellaneous: week.miscellaneous,
      electricity: 0,
      gas: 0,
      water: 0,
      total: week.total,
    };
  }

  if (period === "Yearly") {
    const year = String(today.getFullYear());
    const monthKeys = getAllMonthKeys(entries).filter((key) =>
      key.startsWith(year),
    );
    const totals = {
      dinner: 0,
      miscellaneous: 0,
      electricity: 0,
      gas: 0,
      water: 0,
    };
    monthKeys.forEach((key) => {
      const s = summarizeMonth(key, entries);
      Object.keys(totals).forEach((cat) => {
        totals[cat] += s.totals[cat];
      });
    });
    const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
    return { ...totals, total };
  }

  // Monthly
  return { ...month.totals, total: month.total };
}
