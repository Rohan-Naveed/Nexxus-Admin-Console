// Pure calculation helpers for the Tax tab. This report estimates tax from
// each dispatcher's taxable pay: base salary + commission + fuel allowance.
// Generated salary slips calculate withholding from the account payout
// requested for that slip, so this estimate can differ from saved slips.
//
// Structurally this mirrors src/utils/reportsCalc.js — same synced
// gross-history source (WEEKLY_GROSS_HISTORY / YEARLY_GROSS_HISTORY),
// same "every period that has data" period list, same monthly/yearly
// shape — so Tax and Reports always agree on which months/years are
// available and how a partially-synced month is pro-rated.
//
// TODO(backend): once payroll_weeks is a real DB table and tax % lives
// in a Settings/admin_config table, only the imports and the taxPercent
// source change — the calculation below stays the same.

import {
  WEEKLY_GROSS_HISTORY,
  YEARLY_GROSS_HISTORY,
} from "../data/payrollHistory";
import { getMonthLabel } from "./expenseCalc";
import { getMonthWeekCountByKey } from "./periods";
import { getEffectiveTaxPercent } from "./rates";
import {
  getAvailableReportMonthKeys,
  getAvailableReportYears,
  getDefaultReportPeriodKey,
  isMonthInProgressKey,
} from "./reportsCalc";

export {
  getAvailableReportMonthKeys as getAvailableTaxMonthKeys,
  getAvailableReportYears as getAvailableTaxYears,
  getDefaultReportPeriodKey as getDefaultTaxPeriodKey,
  isMonthInProgressKey,
};

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

// Effective-dated tax rate lookup lives in ./rates (shared with reports).
export { getEffectiveTaxPercent };

// Taxable base + tax for one dispatcher over one period. `salaryFieldsKey`
// picks which of the dispatcher's Weekly/Monthly/Yearly base-salary and
// fuel-allowance figures to use; `fraction` pro-rates those two the same
// way reportsCalc.js does for a month still mid-sync (synced weeks / the
// month's week count).
function taxRowFor(
  dispatcher,
  gross,
  salaryFieldsKey,
  taxPercent,
  fraction = 1,
) {
  const baseSalary =
    (dispatcher.basicSalary?.[salaryFieldsKey] ?? 0) * fraction;
  const fuelAllowance =
    (dispatcher.fuelAllowance?.[salaryFieldsKey] ?? 0) * fraction;
  const commission = gross * (dispatcher.percentage ?? 0);
  const taxableBase = baseSalary + commission + fuelAllowance;
  const tax = ((Number(taxPercent) || 0) / 100) * taxableBase;
  return { baseSalary, fuelAllowance, commission, taxableBase, tax };
}

// Full monthly tax report: per-dispatcher taxable pay + tax, for one
// "YYYY-MM" month key.
export function getMonthlyTaxReport(
  monthKey,
  { dispatchers, taxPercent, taxRates },
) {
  const appliedTaxPercent = Array.isArray(taxRates)
    ? getEffectiveTaxPercent(taxRates, monthKey)
    : taxPercent;
  let anySynced = false;
  let taxableTotal = 0;
  let taxTotal = 0;

  const rows = dispatchers.map((dispatcher) => {
    const weeks = WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey];
    const known = weeks ? Object.values(weeks).filter((v) => v != null) : [];
    const dGross = known.reduce((sum, v) => sum + v, 0);
    if (known.length > 0) anySynced = true;

    const { baseSalary, fuelAllowance, commission, taxableBase, tax } =
      taxRowFor(
        dispatcher,
        dGross,
        "Monthly",
        appliedTaxPercent,
        known.length / getMonthWeekCountByKey(monthKey),
      );
    taxableTotal += taxableBase;
    taxTotal += tax;

    return {
      dispatcherId: dispatcher.id,
      dispatcherName: dispatcher.alias || dispatcher.name,
      syncedWeeks: known.length,
      gross: dGross,
      baseSalary,
      commission,
      fuelAllowance,
      taxableBase,
      tax,
    };
  });

  return {
    periodType: "Monthly",
    periodKey: monthKey,
    label: getMonthLabel(monthKey),
    reached: anySynced,
    taxPercent: Number(appliedTaxPercent) || 0,
    hasTaxRate: appliedTaxPercent != null,
    taxRateLabel:
      appliedTaxPercent == null
        ? "No rate configured"
        : `${appliedTaxPercent}%`,
    taxableTotal,
    taxTotal,
    rows,
  };
}

// Full yearly tax report. Where monthly history exists for the year, sums
// 12 monthly reports (same as reportsCalc.js#getYearlyReport). Otherwise,
// annual totals have no monthly detail.
export function getYearlyTaxReport(
  year,
  { dispatchers, taxPercent, taxRates },
) {
  const availableMonths = getAvailableReportMonthKeys();
  const monthKeysInYear = Array.from({ length: 12 }, (_, i) =>
    monthKeyOf(year, i),
  ).filter((key) => availableMonths.includes(key));

  if (monthKeysInYear.length > 0) {
    const monthlyReports = monthKeysInYear.map((key) =>
      getMonthlyTaxReport(key, { dispatchers, taxPercent, taxRates }),
    );
    const configuredRates = [
      ...new Set(
        monthlyReports
          .filter((report) => report.hasTaxRate)
          .map((report) => report.taxPercent),
      ),
    ];

    const rowsById = new Map(
      dispatchers.map((d) => [
        d.id,
        {
          dispatcherId: d.id,
          dispatcherName: d.alias || d.name,
          gross: 0,
          baseSalary: 0,
          commission: 0,
          fuelAllowance: 0,
          taxableBase: 0,
          tax: 0,
        },
      ]),
    );
    monthlyReports.forEach((report) => {
      report.rows.forEach((row) => {
        const acc = rowsById.get(row.dispatcherId);
        if (!acc) return;
        acc.gross += row.gross;
        acc.baseSalary += row.baseSalary;
        acc.commission += row.commission;
        acc.fuelAllowance += row.fuelAllowance;
        acc.taxableBase += row.taxableBase;
        acc.tax += row.tax;
      });
    });

    return {
      periodType: "Yearly",
      periodKey: String(year),
      label: String(year),
      reached: true,
      hasDetail: true,
      taxPercent: configuredRates.length === 1 ? configuredRates[0] : null,
      hasTaxRate: configuredRates.length > 0,
      taxRateLabel:
        configuredRates.length === 0
          ? "No rate configured"
          : configuredRates.length === 1
            ? `${configuredRates[0]}%`
            : "varies by effective month",
      taxableTotal: monthlyReports.reduce((s, r) => s + r.taxableTotal, 0),
      taxTotal: monthlyReports.reduce((s, r) => s + r.taxTotal, 0),
      rows: [...rowsById.values()],
      monthsCovered: monthKeysInYear.length,
      monthlyBreakdown: monthlyReports.map((r) => ({
        key: r.periodKey,
        label: r.label,
        shortLabel: r.label.split(" ")[0].slice(0, 3),
        reached: r.reached,
        hasTaxRate: r.hasTaxRate,
        taxableTotal: r.taxableTotal,
        taxTotal: r.taxTotal,
      })),
    };
  }

  const yearEndRate = Array.isArray(taxRates)
    ? getEffectiveTaxPercent(taxRates, `${year}-12`)
    : taxPercent;
  const rows = dispatchers.map((dispatcher) => {
    const dGross = YEARLY_GROSS_HISTORY[dispatcher.id]?.[year] ?? 0;
    const { baseSalary, fuelAllowance, commission, taxableBase, tax } =
      taxRowFor(dispatcher, dGross, "Yearly", yearEndRate);
    return {
      dispatcherId: dispatcher.id,
      dispatcherName: dispatcher.alias || dispatcher.name,
      gross: dGross,
      baseSalary,
      commission,
      fuelAllowance,
      taxableBase,
      tax,
    };
  });

  return {
    periodType: "Yearly",
    periodKey: String(year),
    label: String(year),
    reached: rows.some((r) => r.gross > 0),
    hasDetail: false,
    taxPercent: Number(yearEndRate) || 0,
    hasTaxRate: yearEndRate != null,
    taxRateLabel:
      yearEndRate == null
        ? "No rate configured"
        : `${yearEndRate}% (effective at year end)`,
    taxableTotal: rows.reduce((s, r) => s + r.taxableBase, 0),
    taxTotal: rows.reduce((s, r) => s + r.tax, 0),
    rows,
    monthsCovered: 0,
    monthlyBreakdown: [],
  };
}
