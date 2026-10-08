// The notification centre. Notifications are DERIVED from current state
// on every request — nothing is stored and there's nothing to dismiss;
// an alert disappears by itself once the underlying problem is fixed.
//
// Today: "weeks not set", "dollar rate not set", "tax rate not set" and
// "monthly expenses missing" alerts. Add new kinds by pushing more items.

const calendarService = require("../calendar/calendar.service");
const ratesService = require("../rates/rates.service");
const expensesService = require("../expenses/expenses.service");
const config = require("../../../config/config.json");
const wc = require("../../utils/weekCalendar");

const pad = (n) => String(n).padStart(2, "0");
const monthKey = ({ year, month }) => `${year}-${pad(month)}`;

// ---- monthly expenses (dinner + electricity/gas/water) ------------------
// Entered once a month. Once a month's LAST WEEK has ended, any of the four
// still missing raises an alert (one per month) until they're entered.
// Only recent months are checked so old history doesn't flood the bell:
// from config.expenses.notifyFromMonth ("YYYY-MM") if set, otherwise the
// last few months.
const NOTIFY_LOOKBACK_MONTHS = 2;

function monthKeyMinus({ year, month }, n) {
  const idx = year * 12 + (month - 1) - n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

async function getMonthlyExpenseItems(weeks, today, cur) {
  const fromKey =
    config.expenses?.notifyFromMonth || monthKeyMinus(cur, NOTIFY_LOOKBACK_MONTHS);

  // Date span of every period month that has weeks set.
  const spans = new Map();
  for (const w of weeks) {
    const key = monthKey(w);
    const span = spans.get(key) ?? { year: w.year, month: w.month, start: w.start, end: w.end };
    if (w.start < span.start) span.start = w.start;
    if (w.end > span.end) span.end = w.end;
    spans.set(key, span);
  }
  const due = [...spans.entries()]
    .filter(([key, span]) => key >= fromKey && span.end < today)
    .sort(([a], [b]) => (a < b ? 1 : -1));
  if (due.length === 0) return [];

  const from = due.reduce((min, [, s]) => (s.start < min ? s.start : min), due[0][1].start);
  const to = due.reduce((max, [, s]) => (s.end > max ? s.end : max), due[0][1].end);
  const entries = await expensesService.fetchByDateRange(from, to);

  const items = [];
  for (const [key, span] of due) {
    const inMonth = entries.filter((e) => e.date >= span.start && e.date <= span.end);
    const missing = expensesService.MONTHLY_CATEGORIES.filter(
      (cat) => !inMonth.some((e) => e.category === cat),
    );
    if (missing.length === 0) continue;

    const label = calendarService.monthLabel(span.year, span.month);
    const names = missing.map((cat) => expensesService.MONTHLY_LABELS[cat].toLowerCase());
    items.push({
      id: `monthly-expenses-missing:${key}`,
      type: "monthly_expenses_missing",
      severity: "warning",
      title: `Monthly expenses missing for ${label}`,
      message: `${label} has ended. Still to add: ${names.join(", ")}. Enter 0 for a bill that doesn't apply.`,
      action: { label: "Add expenses", tab: "expenses" },
    });
  }
  return items;
}

async function getNotifications(now = new Date()) {
  const today = wc.todayInTimezone(now);
  const cur = wc.currentMonth(now);
  const next = wc.nextMonthOf(cur);
  const daysLeft = wc.daysInMonth(cur.year, cur.month) - Number(today.slice(8, 10));

  const weeks = await calendarService.getAllWeeks();
  const isSet = (m) => weeks.some((w) => w.year === m.year && w.month === m.month);

  const todayWeek = weeks.find((w) => w.start <= today && today <= w.end);
  // Check this calendar month and the next one.
  const checks = [
    { ...cur, when: "current" },
    { ...next, when: "next" },
  ];

  const items = [];
  for (const c of checks) {
    if (isSet(c)) continue;
    const label = calendarService.monthLabel(c.year, c.month);
    const critical = c.when === "current" || daysLeft <= 7;
    items.push({
      id: `weeks-not-set:${monthKey(c)}`,
      type: "weeks_not_set",
      severity: critical ? "critical" : "warning",
      title: `Weeks not set for ${label}`,
      message:
        c.when === "current"
          ? `The admin console and the sync scheduler depend on the weeks. Nothing is synced for ${label} until they are set.`
          : `${label} starts soon. Set its weeks so syncing and week-based screens keep working.`,
      action: { label: "Set weeks", tab: "calendar", month: monthKey(c) },
    });
  }

  // Today isn't inside any saved week (e.g. the last saved week ended).
  if (!todayWeek && isSet(cur)) {
    items.push({
      id: `today-not-covered:${today}`,
      type: "today_not_covered",
      severity: "critical",
      title: "Today isn't inside any week",
      message: "The last week you set has ended. Add the next week(s) so the console knows the current week.",
      action: { label: "Set weeks", tab: "calendar", month: monthKey(next) },
    });
  }

  // ---- dollar rate + tax rate --------------------------------------
  // Gross is stored in USD and converted with the month's rate, so the
  // admin needs a rate for the month payroll is being worked on. The
  // month is the one today's week is labelled with (falls back to the
  // calendar month). Until a rate is set the console uses the most recent
  // earlier one, and says so here. The next month only warns during the
  // last 7 days of this one, since rates usually aren't known earlier.
  const periodMonth = todayWeek ? { year: todayWeek.year, month: todayWeek.month } : cur;
  const periodNext = wc.nextMonthOf(periodMonth);
  // Days left in the period month = until its last week ends (falls back
  // to the calendar month end when its weeks aren't set).
  const periodWeeks = weeks.filter((w) => w.year === periodMonth.year && w.month === periodMonth.month);
  const periodDaysLeft = periodWeeks.length
    ? wc.diffDays(today, periodWeeks.reduce((max, w) => (w.end > max ? w.end : max), periodWeeks[0].end))
    : wc.daysInMonth(periodMonth.year, periodMonth.month) - Number(today.slice(8, 10));
  const [usdRates, taxRates] = await Promise.all([
    ratesService.fetchAllUsdRates(),
    ratesService.fetchAllTaxRates(),
  ]);

  const rateChecks = [
    { m: periodMonth, when: "current" },
    { m: periodNext, when: "next" },
  ];
  const kinds = [
    {
      type: "usd_rate_not_set",
      idPrefix: "usd-rate-not-set",
      rates: usdRates,
      name: "Dollar rate",
      value: (r) => `${r.ratePkrPerUsd} PKR per USD`,
      consequence:
        "Gross (stored in USD) can't be converted to PKR exactly for that month, so payroll is using the rate below.",
    },
    {
      type: "tax_rate_not_set",
      idPrefix: "tax-rate-not-set",
      rates: taxRates,
      name: "Tax rate",
      value: (r) => `${r.taxPercent}%`,
      consequence: "Tax is being worked out with the rate below.",
    },
  ];

  for (const kind of kinds) {
    for (const { m, when } of rateChecks) {
      if (when === "next" && periodDaysLeft > 7) continue;
      const key = m.year * 100 + m.month;
      if (kind.rates.some((r) => r.periodYear * 100 + r.periodMonth === key)) continue;

      const label = calendarService.monthLabel(m.year, m.month);
      const earlier = kind.rates
        .filter((r) => r.periodYear * 100 + r.periodMonth < key)
        .sort((a, b) => b.periodYear * 100 + b.periodMonth - (a.periodYear * 100 + a.periodMonth))[0];
      const fallback = earlier
        ? `${kind.consequence} Using ${calendarService.monthLabel(earlier.periodYear, earlier.periodMonth)}'s: ${kind.value(earlier)}.`
        : `${kind.name} has never been set, so amounts that depend on it can't be worked out.`;

      items.push({
        id: `${kind.idPrefix}:${monthKey(m)}`,
        type: kind.type,
        severity: when === "current" && !earlier ? "critical" : "warning",
        title: `${kind.name} not set for ${label}`,
        message: fallback,
        action: { label: `Set ${kind.name.toLowerCase()}`, tab: "settings" },
      });
    }
  }

  items.push(...(await getMonthlyExpenseItems(weeks, today, cur)));

  return {
    count: items.length,
    critical: items.filter((i) => i.severity === "critical").length,
    items,
  };
}

module.exports = { getNotifications };
