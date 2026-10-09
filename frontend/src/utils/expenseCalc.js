import { MONTH_NAMES, getPeriodMonthKey } from "./periods";

const calendarMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function getMonthKey(date) {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return getPeriodMonthKey(d);
}

export const getCalendarMonthKey = calendarMonthKey;

export function getExpenseMonthKey(entry) {
  return entry.monthKey || String(entry.date ?? "").slice(0, 7);
}

export function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function sortByDateDesc(entries) {
  return [...entries].sort((a, b) => {
    const aMonth = getExpenseMonthKey(a);
    const bMonth = getExpenseMonthKey(b);
    if (aMonth !== bMonth) return aMonth < bMonth ? 1 : -1;
    return (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1;
  });
}

export function getAllMonthKeys(entries) {
  const keys = new Set(entries.map(getExpenseMonthKey));
  return [...keys].filter(Boolean).sort().reverse();
}

export function summarizeMonth(monthKey, allEntries) {
  const entries = allEntries.filter(
    (entry) => getExpenseMonthKey(entry) === monthKey,
  );
  const totals = {};
  entries.forEach((entry) => {
    totals[entry.category] =
      (totals[entry.category] ?? 0) + Number(entry.amount || 0);
  });
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return {
    monthKey,
    label: getMonthLabel(monthKey),
    entries: sortByDateDesc(entries),
    totals,
    categoryTotals: Object.entries(totals).map(([key, amount]) => ({
      key,
      amount,
    })),
    weeks: [],
    billEntries: sortByDateDesc(entries),
    missingMonthly: [],
    weeklyTotal: 0,
    billsTotal: total,
    total,
  };
}

export function getExpensesForPeriod(period, entries, today = new Date()) {
  const currentMonthKey = calendarMonthKey(today);
  const zeroTotals = {};

  if (period === "Weekly") {
    const byCategory = entries.reduce((totals, entry) => {
      totals[entry.category] = 0;
      return totals;
    }, zeroTotals);
    return { ...byCategory, byCategory, total: 0 };
  }

  const monthKeys =
    period === "Yearly"
      ? getAllMonthKeys(entries).filter((key) =>
          key.startsWith(String(today.getFullYear())),
        )
      : [currentMonthKey];
  const byCategory = {};
  let total = 0;
  monthKeys.forEach((key) => {
    const summary = summarizeMonth(key, entries);
    Object.entries(summary.totals).forEach(([category, amount]) => {
      byCategory[category] = (byCategory[category] ?? 0) + amount;
    });
    total += summary.total;
  });
  return { ...byCategory, byCategory, total };
}
