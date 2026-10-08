// Pure calculation helpers for the Reports tab. Reuses the same synced
// gross-history source as Payroll (WEEKLY_GROSS_HISTORY / YEARLY_GROSS_HISTORY,
// see src/data/payrollHistory.js) but — unlike Payroll's "last 6 months /
// last 5 years" rolling trend — surfaces EVERY period that has any synced
// data, since Reports exists for audit / record-keeping rather than a
// rolling dashboard view.
//
// Deductions here are read from the Deductions (fines) log — see
// src/utils/finesCalc.js — NOT from whatever a specific salary slip ended
// up recording. A slip's late/violation/advance fields can be hand-edited
// at generation time, so the two can drift apart; this report always
// reflects the Deductions log itself. Flagged in ReportsTab's UI copy too.
//
// TODO(backend): once payroll_weeks / expenses / fines are real DB
// tables, only the imports below change — everything else keeps working
// the same way, same as payrollHistoryCalc.js.

import {
  WEEKLY_GROSS_USD,
  WEEKLY_GROSS_HISTORY,
  WEEKLY_TRACKING_USD,
  WEEKLY_TRACKING_HISTORY,
  YEARLY_GROSS_HISTORY,
} from "../data/payrollHistory";
import { EXPENSE_CATEGORIES } from "../data/expenses";
import {
  getMonthKey,
  getMonthLabel,
  getAllMonthKeys,
  summarizeMonth,
} from "./expenseCalc";
import { summarizeFinesMonth } from "./finesCalc";
import {
  formatRange,
  getMonthWeekChunks,
  getMonthWeekCountByKey,
  getPeriodMonth,
  getPeriodMonthKey,
  getWeekOfMonth,
  isMonthInProgressKey,
} from "./periods";
import { getEffectiveTaxPercent } from "./rates";

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function grossUsdForMonth(dispatcherId, monthKey) {
  const pkrWeeks = WEEKLY_GROSS_HISTORY[dispatcherId]?.[monthKey] ?? {};
  const usdWeeks = WEEKLY_GROSS_USD[dispatcherId]?.[monthKey] ?? {};
  return Object.entries(pkrWeeks).reduce(
    (sum, [week, pkr]) => sum + (pkr == null ? 0 : Number(usdWeeks[week]) || 0),
    0,
  );
}

function grossUsdForYear(dispatcherId, year) {
  return Object.keys(WEEKLY_GROSS_HISTORY[dispatcherId] ?? {})
    .filter((monthKey) => monthKey.startsWith(`${year}-`))
    .reduce(
      (sum, monthKey) => sum + grossUsdForMonth(dispatcherId, monthKey),
      0,
    );
}

function trackingFeeForMonth(dispatcherId, monthKey) {
  return Object.values(WEEKLY_TRACKING_HISTORY[dispatcherId]?.[monthKey] ?? {})
    .filter((value) => value != null)
    .reduce((sum, value) => sum + Number(value), 0);
}

function trackingFeeUsdForMonth(dispatcherId, monthKey) {
  return Object.values(WEEKLY_TRACKING_USD[dispatcherId]?.[monthKey] ?? {})
    .filter((value) => value != null)
    .reduce((sum, value) => sum + Number(value), 0);
}

function trackingFeeForYear(dispatcherId, year) {
  return Object.entries(WEEKLY_TRACKING_HISTORY[dispatcherId] ?? {})
    .filter(([monthKey]) => monthKey.startsWith(`${year}-`))
    .reduce(
      (sum, [, weeks]) =>
        sum +
        Object.values(weeks)
          .filter((value) => value != null)
          .reduce((monthTotal, value) => monthTotal + Number(value), 0),
      0,
    );
}

function trackingFeeUsdForYear(dispatcherId, year) {
  return Object.keys(WEEKLY_TRACKING_USD[dispatcherId] ?? {})
    .filter((monthKey) => monthKey.startsWith(`${year}-`))
    .reduce(
      (sum, monthKey) => sum + trackingFeeUsdForMonth(dispatcherId, monthKey),
      0,
    );
}

function expenseRows(entries, monthKey) {
  return entries.map((entry) => ({
    monthKey,
    date: String(entry.date).slice(0, 10),
    category: entry.category,
    categoryLabel: EXPENSE_CATEGORIES[entry.category]?.label ?? entry.category,
    note: entry.note || "",
    amount: Number(entry.amount) || 0,
  }));
}

function employeeActiveInMonth(employee, monthKey) {
  const joined = employee.profile?.joinedDate;
  const left = employee.profile?.leftDate;
  if (!joined) return monthKey === getPeriodMonthKey(new Date());
  const joinedMonth = joined.slice(0, 7);
  const leftMonth = left?.slice(0, 7);
  return monthKey >= joinedMonth && (!leftMonth || monthKey <= leftMonth);
}

// Real week-by-week breakdown of a month for the Reports tab. Unlike
// periodBreakdown.js's Payroll-tab estimates (which spread a single
// period total across sub-periods by days-elapsed), this uses the
// ACTUAL per-week synced gross already sitting in WEEKLY_GROSS_HISTORY
// (see src/data/payrollHistory.js) and the actual recorded expense/fine
// entries for that week — nothing here is estimated. A week with no
// dispatcher synced yet (future week, or a month still in progress)
// comes back with reached: false.
//
// Office bills (electricity/gas/water) aren't split into weeks — they're
// only ever entered once a month — so `expenses` here is dinner +
// miscellaneous only, same convention as periodBreakdown.js's weekly
// table. The bills total is returned separately on the report
// (`billsTotal`) so callers can foot-note it rather than silently
// losing it from the weekly figures.
function getMonthlyWeeklyBreakdown(
  monthKey,
  { dispatchers, expenseSummary, fineEntries },
) {
  const [year, month] = monthKey.split("-").map(Number);
  const chunks = getMonthWeekChunks(year, month - 1);

  const weeklyDeductions = chunks.map(() => 0);
  fineEntries.forEach((fine) => {
    if (getMonthKey(fine.date) !== monthKey) return;
    const weekNumber = getWeekOfMonth(new Date(fine.date + "T00:00:00"));
    weeklyDeductions[Math.min(weekNumber, chunks.length) - 1] += fine.amount;
  });

  return chunks.map((chunk, i) => {
    const weekField = `week${chunk.weekNumber}`;
    let gross = 0;
    let grossUsd = 0;
    let trackingFees = 0;
    let trackingFeesUsd = 0;
    let payroll = 0;
    let reached = false;

    dispatchers.forEach((dispatcher) => {
      if (dispatcher.employeeType === "employee") {
        if (employeeActiveInMonth(dispatcher, monthKey)) {
          reached = true;
          payroll += (dispatcher.basicSalary?.Monthly ?? 0) / chunks.length;
        }
        return;
      }
      const value =
        WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey]?.[weekField];
      if (value == null) return;
      reached = true;
      gross += value;
      grossUsd +=
        Number(WEEKLY_GROSS_USD[dispatcher.id]?.[monthKey]?.[weekField]) || 0;
      trackingFees +=
        WEEKLY_TRACKING_HISTORY[dispatcher.id]?.[monthKey]?.[weekField] ?? 0;
      trackingFeesUsd +=
        WEEKLY_TRACKING_USD[dispatcher.id]?.[monthKey]?.[weekField] ?? 0;
      const base = (dispatcher.basicSalary?.Monthly ?? 0) / chunks.length;
      const commission = value * (dispatcher.percentage ?? 0);
      payroll += base + commission;
    });

    const expenses = expenseSummary.weeks[i]?.total ?? 0;
    const deductions = weeklyDeductions[i];

    return {
      key: `week-${chunk.weekNumber}`,
      weekNumber: chunk.weekNumber,
      label: `Week ${chunk.weekNumber}`,
      rangeLabel: formatRange(chunk.start, chunk.end),
      reached,
      gross,
      grossUsd,
      trackingFees,
      trackingFeesUsd,
      payroll,
      expenses,
      deductions,
      profit: gross + trackingFees - payroll - expenses,
    };
  });
}

function salaryFor(dispatcher, gross, periodKey) {
  const base = dispatcher.basicSalary?.[periodKey] ?? 0;
  const commission = gross * (dispatcher.percentage ?? 0);
  return base + commission;
}

// Every month key ("YYYY-MM") with at least one dispatcher's synced
// gross, newest first.
export function getAvailableReportMonthKeys(
  employees = [],
  today = new Date(),
) {
  const keys = new Set();
  Object.values(WEEKLY_GROSS_HISTORY).forEach((byMonth) => {
    Object.entries(byMonth).forEach(([monthKey, weeks]) => {
      if (Object.values(weeks).some((v) => v != null)) keys.add(monthKey);
    });
  });
  const currentKey = monthKeyOf(today.getFullYear(), today.getMonth());
  employees
    .filter(
      (employee) =>
        employee.employeeType === "employee" &&
        (employee.basicSalary?.Monthly ?? 0) > 0,
    )
    .forEach((employee) => {
      const joined = employee.profile?.joinedDate;
      const left = employee.profile?.leftDate;
      const start = joined
        ? new Date(`${joined.slice(0, 10)}T00:00:00`)
        : today;
      const end = left ? new Date(`${left.slice(0, 10)}T00:00:00`) : today;
      for (
        let year = start.getFullYear();
        year <= end.getFullYear();
        year += 1
      ) {
        const firstMonth = year === start.getFullYear() ? start.getMonth() : 0;
        const lastMonth = year === end.getFullYear() ? end.getMonth() : 11;
        for (let month = firstMonth; month <= lastMonth; month += 1) {
          const key = monthKeyOf(year, month);
          if (key <= currentKey) keys.add(key);
        }
      }
    });
  return [...keys].sort().reverse();
}

// Every calendar year with at least one dispatcher's synced gross,
// newest first.
export function getAvailableReportYears(employees = [], today = new Date()) {
  const years = new Set();
  getAvailableReportMonthKeys(employees, today).forEach((key) =>
    years.add(Number(key.slice(0, 4))),
  );
  Object.values(YEARLY_GROSS_HISTORY).forEach((byYear) => {
    Object.keys(byYear).forEach((year) => years.add(Number(year)));
  });
  return [...years].sort((a, b) => b - a);
}

// The newest period that isn't still in progress, for a given
// "Monthly" | "Yearly" period type — mirrors
// payrollHistoryCalc.js#getDefaultSlipMonthKey so Reports defaults to
// the most recently CLOSED period, which is almost always what an audit
// export is for. Falls back to the newest available period otherwise.
export function getDefaultReportPeriodKey(
  periodType,
  today = new Date(),
  employees = [],
) {
  if (periodType === "Yearly") {
    const years = getAvailableReportYears(employees, today);
    const completed = years.find((year) => year !== today.getFullYear());
    return completed != null
      ? String(completed)
      : years[0] != null
        ? String(years[0])
        : null;
  }
  const keys = getAvailableReportMonthKeys(employees, today);
  const completed = keys.find((key) => !isMonthInProgressKey(key, today));
  return completed ?? keys[0] ?? null;
}

// Full monthly report: company totals + a per-dispatcher breakdown, for
// one "YYYY-MM" month key. `taxPercent` comes from the rates API — tax
// for saved slips is the actual recorded withholding. Current-month
// dispatcher rows without a slip estimate withholding assuming full
// account payout; fixed-salary rows without a slip are not taxed.
export function getMonthlyReport(
  monthKey,
  {
    dispatchers,
    expenseEntries = [],
    fineEntries = [],
    taxPercent: fallbackTaxPercent,
    taxRates,
    salarySlips = [],
  },
) {
  // The tax rate in force for THIS month (effective-dated), falling back
  // to the single latest rate when the list of rates isn't supplied.
  const taxPercent = Array.isArray(taxRates)
    ? getEffectiveTaxPercent(taxRates, monthKey)
    : fallbackTaxPercent;
  const weekCount = getMonthWeekCountByKey(monthKey);
  const expenses = summarizeMonth(monthKey, expenseEntries);
  const deductions = summarizeFinesMonth(monthKey, fineEntries, dispatchers);
  const deductionByDispatcher = new Map(
    deductions.groups.map((g) => [g.dispatcherId, g.total]),
  );
  const slipByDispatcher = new Map(
    salarySlips
      .filter((slip) => {
        const slipMonth =
          slip.monthKey ??
          `${slip.periodYear}-${String(slip.periodMonth).padStart(2, "0")}`;
        return slipMonth === monthKey;
      })
      .map((slip) => [String(slip.dispatcherId), slip]),
  );
  const currentMonth = getPeriodMonth(new Date());
  const isCurrentMonth =
    monthKey === monthKeyOf(currentMonth.year, currentMonth.monthIndex);

  let gross = 0;
  let grossUsd = 0;
  let trackingFees = 0;
  let trackingFeesUsd = 0;
  let payroll = 0;
  let advances = 0;
  let anySynced = false;

  const rows = dispatchers.map((dispatcher) => {
    const isFixedSalaryEmployee = dispatcher.employeeType === "employee";
    const weeks = WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey];
    const known =
      !isFixedSalaryEmployee && weeks
        ? Object.values(weeks).filter((v) => v != null)
        : [];
    const dGross = known.reduce((sum, v) => sum + v, 0);
    if (known.length > 0) anySynced = true;

    // Base salary and fuel allowance are pro-rated by how many of the
    // month's weeks have synced, same convention as
    // payrollHistoryCalc.js#getMonthlyTrendBreakdown, so a partially
    // synced month (almost always just the current one) doesn't
    // overstate either figure.
    const employeeActive =
      isFixedSalaryEmployee && employeeActiveInMonth(dispatcher, monthKey);
    const base = isFixedSalaryEmployee
      ? employeeActive
        ? (dispatcher.basicSalary?.Monthly ?? 0)
        : 0
      : (dispatcher.basicSalary?.Monthly ?? 0) * (known.length / weekCount);
    const fuelAllowance = isFixedSalaryEmployee
      ? 0
      : (dispatcher.fuelAllowance?.Monthly ?? 0) * (known.length / weekCount);
    const commission = isFixedSalaryEmployee
      ? 0
      : dGross * (dispatcher.percentage ?? 0);
    const dGrossUsd = isFixedSalaryEmployee
      ? 0
      : grossUsdForMonth(dispatcher.id, monthKey);
    const dTrackingFee = isFixedSalaryEmployee
      ? 0
      : trackingFeeForMonth(dispatcher.id, monthKey);
    const dTrackingFeeUsd = isFixedSalaryEmployee
      ? 0
      : trackingFeeUsdForMonth(dispatcher.id, monthKey);
    const commissionUsd = dGrossUsd * (dispatcher.percentage ?? 0);
    const savedSlip = slipByDispatcher.get(String(dispatcher.id));
    const salaryBase = savedSlip
      ? Number(savedSlip.basicSalary) || 0
      : base;
    const salaryCommission = savedSlip
      ? Number(savedSlip.amountInPkr) || 0
      : commission;
    const salaryCommissionUsd = savedSlip
      ? Number(savedSlip.commissionUsd) || 0
      : commissionUsd;
    const salaryFuelAllowance = savedSlip
      ? Number(savedSlip.fuelAllowance) || 0
      : fuelAllowance;
    const salary = savedSlip
      ? Number(savedSlip.totalEarnings) ||
        salaryBase + salaryCommission + salaryFuelAllowance
      : base + commission + fuelAllowance;
    if (employeeActive || salary > 0) anySynced = true;
    const savedFines = savedSlip
      ? (Number(savedSlip.lateFine) || 0) +
        (Number(savedSlip.violationFine) || 0)
      : null;
    const dedAmount =
      savedFines ?? deductionByDispatcher.get(dispatcher.id) ?? 0;
    const advance = Number(savedSlip?.advance) || 0;
    const availablePay = salary - dedAmount - advance;
    const tax = savedSlip
      ? Number(savedSlip.incomeTax) || 0
      : isCurrentMonth && !isFixedSalaryEmployee
        ? estimateFullAccountTax(availablePay, taxPercent)
        : 0;
    const netPay =
      savedSlip?.netPay != null
        ? Number(savedSlip.netPay) || 0
        : salary - dedAmount - advance - tax;

    gross += dGross;
    grossUsd += dGrossUsd;
    trackingFees += dTrackingFee;
    trackingFeesUsd += dTrackingFeeUsd;
    payroll += netPay;
    advances += advance;

    return {
      dispatcherId: dispatcher.id,
      employeeType: dispatcher.employeeType || "dispatcher",
      dispatcherName: dispatcher.alias || dispatcher.name,
      syncedWeeks: known.length,
      gross: dGross,
      grossUsd: dGrossUsd,
      trackingFee: dTrackingFee,
      trackingFeeUsd: dTrackingFeeUsd,
      baseSalary: salaryBase,
      commission: savedSlip ? salaryCommission : commission,
      commissionUsd: salaryCommissionUsd,
      salary,
      fuelAllowance: salaryFuelAllowance,
      deductions: dedAmount,
      advance,
      tax,
      netPay,
    };
  });

  return {
    periodType: "Monthly",
    periodKey: monthKey,
    label: getMonthLabel(monthKey),
    reached: anySynced || expenses.total > 0,
    taxPercent: Number(taxPercent) || 0,
    gross,
    grossUsd,
    trackingFees,
    trackingFeesUsd,
    payroll,
    expenses: expenses.total,
    expenseCategories: expenses.totals,
    expenseRows: expenseRows(expenses.entries, monthKey),
    billsTotal: expenses.billsTotal,
    deductions: rows.reduce((sum, row) => sum + row.deductions, 0),
    advances,
    tax: rows.reduce((s, r) => s + r.tax, 0),
    profit: gross + trackingFees - payroll - expenses.total,
    rows,
    weeklyBreakdown: getMonthlyWeeklyBreakdown(monthKey, {
      dispatchers,
      expenseSummary: expenses,
      fineEntries,
    }),
  };
}

function estimateFullAccountTax(payBeforeTax, taxPercent) {
  const availablePay = Number(payBeforeTax) || 0;
  const taxRate = Math.max(0, (Number(taxPercent) || 0) / 100);
  if (availablePay <= 0 || taxRate === 0) return 0;

  let tax = Number(((availablePay * taxRate) / (1 + taxRate)).toFixed(2));
  for (let i = 0; i < 100; i += 1) {
    const accountAmount = Number((availablePay - tax).toFixed(2));
    const nextTax = Number((accountAmount * taxRate).toFixed(2));
    if (nextTax === tax) return tax;
    tax = nextTax;
  }
  return tax;
}

// Full yearly report from monthly payroll history and matching expense
// and deduction records.
export function getYearlyReport(
  year,
  {
    dispatchers,
    expenseEntries = [],
    fineEntries = [],
    taxPercent,
    taxRates,
    salarySlips = [],
  },
) {
  const availableMonths = new Set([
    ...getAvailableReportMonthKeys(dispatchers),
    ...getAllMonthKeys(expenseEntries),
    ...salarySlips
      .map(
        (slip) =>
          slip.monthKey ??
          `${slip.periodYear}-${String(slip.periodMonth).padStart(2, "0")}`,
      )
      .filter((key) => key.startsWith(`${year}-`)),
  ]);
  const monthKeysInYear = Array.from({ length: 12 }, (_, i) =>
    monthKeyOf(year, i),
  ).filter((key) => availableMonths.has(key));

  if (monthKeysInYear.length > 0) {
    const monthlyReports = monthKeysInYear.map((key) =>
      getMonthlyReport(key, {
        dispatchers,
        expenseEntries,
        fineEntries,
        taxPercent,
        taxRates,
        salarySlips,
      }),
    );
    const expenseCategoryTotals = Object.fromEntries(
      Object.keys(EXPENSE_CATEGORIES).map((category) => [
        category,
        monthlyReports.reduce(
          (sum, monthlyReport) =>
            sum + (monthlyReport.expenseCategories[category] ?? 0),
          0,
        ),
      ]),
    );

    const rowsById = new Map(
      dispatchers.map((d) => [
        d.id,
        {
          dispatcherId: d.id,
          employeeType: d.employeeType || "dispatcher",
          dispatcherName: d.alias || d.name,
          gross: 0,
          grossUsd: 0,
          trackingFee: 0,
          trackingFeeUsd: 0,
          baseSalary: 0,
          commission: 0,
          commissionUsd: 0,
          salary: 0,
          fuelAllowance: 0,
          deductions: 0,
          advance: 0,
          tax: 0,
          netPay: 0,
        },
      ]),
    );
    monthlyReports.forEach((report) => {
      report.rows.forEach((row) => {
        const acc = rowsById.get(row.dispatcherId);
        if (!acc) return;
        acc.gross += row.gross;
        acc.grossUsd += row.grossUsd;
        acc.trackingFee += row.trackingFee;
        acc.trackingFeeUsd += row.trackingFeeUsd;
        acc.baseSalary += row.baseSalary;
        acc.commission += row.commission;
        acc.commissionUsd += row.commissionUsd;
        acc.salary += row.salary;
        acc.fuelAllowance += row.fuelAllowance;
        acc.deductions += row.deductions;
        acc.advance += row.advance;
        acc.tax += row.tax;
        acc.netPay += row.netPay;
      });
    });

    return {
      periodType: "Yearly",
      periodKey: String(year),
      label: String(year),
      reached: true,
      hasDetail: true,
      taxPercent: Number(taxPercent) || 0,
      gross: monthlyReports.reduce((s, r) => s + r.gross, 0),
      grossUsd: monthlyReports.reduce((s, r) => s + r.grossUsd, 0),
      trackingFees: monthlyReports.reduce((s, r) => s + r.trackingFees, 0),
      trackingFeesUsd: monthlyReports.reduce(
        (s, r) => s + r.trackingFeesUsd,
        0,
      ),
      payroll: monthlyReports.reduce((s, r) => s + r.payroll, 0),
      expenses: monthlyReports.reduce((s, r) => s + r.expenses, 0),
      expenseCategories: expenseCategoryTotals,
      expenseRows: monthlyReports.flatMap((monthlyReport) =>
        monthlyReport.expenseRows.map((row) => ({
          ...row,
          monthLabel: monthlyReport.label,
        })),
      ),
      deductions: monthlyReports.reduce((s, r) => s + r.deductions, 0),
      advances: monthlyReports.reduce((s, r) => s + r.advances, 0),
      tax: monthlyReports.reduce((s, r) => s + r.tax, 0),
      profit: monthlyReports.reduce((s, r) => s + r.profit, 0),
      rows: [...rowsById.values()],
      monthsCovered: monthKeysInYear.length,
      // Real month-by-month breakdown — each entry is just the totals off
      // that month's own report, so it's exactly as real/estimated as the
      // monthly report itself (fully real once every dispatcher's 4 weeks
      // are synced, partial for a month still in progress).
      monthlyBreakdown: monthlyReports.map((r) => ({
        key: r.periodKey,
        monthKey: r.periodKey,
        label: r.label,
        shortLabel: r.label.split(" ")[0].slice(0, 3),
        reached: r.reached,
        gross: r.gross,
        grossUsd: r.grossUsd,
        trackingFees: r.trackingFees,
        trackingFeesUsd: r.trackingFeesUsd,
        payroll: r.payroll,
        expenses: r.expenses,
        expenseCategories: r.expenseCategories,
        deductions: r.deductions,
        advances: r.advances,
        tax: r.tax,
        profit: r.profit,
      })),
    };
  }

  // Annual summaries remain empty until payroll history is supplied.
  const rows = dispatchers.map((dispatcher) => {
    const dGross = YEARLY_GROSS_HISTORY[dispatcher.id]?.[year] ?? 0;
    const dGrossUsd = grossUsdForYear(dispatcher.id, year);
    const fuelAllowance = dispatcher.fuelAllowance?.Yearly ?? 0;
    const salary = salaryFor(dispatcher, dGross, "Yearly") + fuelAllowance;
    return {
      dispatcherId: dispatcher.id,
      employeeType: dispatcher.employeeType || "dispatcher",
      dispatcherName: dispatcher.alias || dispatcher.name,
      gross: dGross,
      trackingFee: trackingFeeForYear(dispatcher.id, year),
      trackingFeeUsd: trackingFeeUsdForYear(dispatcher.id, year),
      grossUsd: dGrossUsd,
      baseSalary: dispatcher.basicSalary?.Yearly ?? 0,
      commission: dGross * (dispatcher.percentage ?? 0),
      commissionUsd: dGrossUsd * (dispatcher.percentage ?? 0),
      salary,
      fuelAllowance,
      deductions: 0,
      advance: 0,
      tax: 0,
      netPay: salary,
    };
  });
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const grossUsd = rows.reduce((s, r) => s + r.grossUsd, 0);
  const trackingFees = rows.reduce((s, r) => s + r.trackingFee, 0);
  const trackingFeesUsd = rows.reduce((s, r) => s + r.trackingFeeUsd, 0);
  const payroll = rows.reduce((s, r) => s + r.netPay, 0);

  return {
    periodType: "Yearly",
    periodKey: String(year),
    label: String(year),
    reached: rows.some((r) => r.gross > 0),
    hasDetail: false,
    taxPercent: Number(taxPercent) || 0,
    gross,
    grossUsd,
    trackingFees,
    trackingFeesUsd,
    payroll,
    expenses: 0,
    expenseCategories: Object.fromEntries(
      Object.keys(EXPENSE_CATEGORIES).map((category) => [category, 0]),
    ),
    expenseRows: [],
    deductions: 0,
    advances: 0,
    tax: 0,
    profit: gross + trackingFees - payroll,
    rows,
    monthsCovered: 0,
    monthlyBreakdown: [],
  };
}
