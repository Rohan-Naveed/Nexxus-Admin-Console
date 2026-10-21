// Pure helpers for the Salary Slips tab: month-key utilities (slips are
// always monthly, keyed the same way expenses are — "YYYY-MM") and the
// actual slip number-crunching, kept separate from any component so the
// same math drives both the on-screen preview and the generated PDF.
import { MONTH_NAMES } from "./periods";

export function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

export function getMonthLabel(monthKey) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

// "2026-07" -> "01/JULY/2026 - 31/JULY/2026", matching the slip template.
export function getSalaryPeriodLabel(monthKey) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const monthName = MONTH_NAMES[monthIndex].toUpperCase();
  return `01/${monthName}/${year} - ${String(lastDay).padStart(2, "0")}/${monthName}/${year}`;
}

// Most recently COMPLETED / eligible month keys used to live here as
// getLastCompletedMonthKey()/getRecentMonthKeys() — both were replaced
// by data-aware equivalents once slip eligibility started depending on
// which months actually have synced gross data. See
// src/utils/payrollHistoryCalc.js#getDefaultSlipMonthKey and
// #getAvailableSlipMonthKeys.

// Everything a slip (preview card or PDF) needs, computed from the
// dispatcher's on-file figures plus the admin's editable inputs for this
// specific month. Tax % and the USD/PKR rate come from backend rate data;
// they are the only two settings-driven inputs;
// everything else is either on the dispatcher record or entered here.
export function computeSlipPreview({
  dispatcher,
  monthKey,
  usdPerPkr,
  taxPercent,
  monthlyGrossUsd,
  bonus = 0,
  lateFine = 0,
  violationFine = 0,
  deductionsBreakdown,
  advance = 0,
  accountAmount = 0,
  cashAmount = 0,
  payoutMode = "account",
}) {
  const usdRate = usdPerPkr > 0 ? 1 / usdPerPkr : 0; // PKR per 1 USD
  const commissionPercent = (dispatcher.percentage ?? 0) * 100;
  const grossUsd = Number(monthlyGrossUsd) || 0;
  const commissionUsd = grossUsd * (dispatcher.percentage ?? 0);
  const amountInPkr = commissionUsd * usdRate;

  const basicSalary = dispatcher.basicSalary?.Monthly ?? 0;
  const fuelAllowance = dispatcher.fuelAllowance?.Monthly ?? 0;
  const totalEarnings = amountInPkr + basicSalary + fuelAllowance;

  const deductionItems = Array.isArray(deductionsBreakdown)
    ? deductionsBreakdown
        .filter((item) => Number(item.amount) > 0)
        .map((item) => ({
          key: item.key,
          label: item.label || item.key,
          amount: Number(item.amount) || 0,
        }))
    : [
        ...(Number(lateFine) > 0
          ? [{ key: "late", label: "Late", amount: Number(lateFine) }]
          : []),
        ...(Number(violationFine) > 0
          ? [
              {
                key: "violation",
                label: "Violation / other",
                amount: Number(violationFine),
              },
            ]
          : []),
      ];
  const late = deductionItems
    .filter((item) => item.key === "late")
    .reduce((sum, item) => sum + item.amount, 0);
  const violation = deductionItems
    .filter((item) => item.key !== "late")
    .reduce((sum, item) => sum + item.amount, 0);
  const loggedDeductions = deductionItems.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const adv = Number(advance) || 0;
  const bonusAmount = Math.max(0, Number(bonus) || 0);
  const enteredAccount = Number(accountAmount) || 0;
  const enteredCash = Number(cashAmount) || 0;
  const taxRate = (Number(taxPercent) || 0) / 100;
  const earningsAfterOtherDeductions = totalEarnings - loggedDeductions - adv;

  let account = enteredAccount;
  let incomeTax;
  let cash;

  if (payoutMode === "cash") {
    cash = enteredCash;
    account = Number(
      (earningsAfterOtherDeductions - (cash - bonusAmount)).toFixed(2),
    );
    for (let i = 0; i < 100; i += 1) {
      incomeTax = Number((Math.max(0, account) * taxRate).toFixed(2));
      const nextAccount = Number(
        (
          earningsAfterOtherDeductions -
          (cash - bonusAmount) -
          incomeTax
        ).toFixed(2),
      );
      if (nextAccount === account) break;
      account = nextAccount;
    }
    incomeTax = Number((Math.max(0, account) * taxRate).toFixed(2));
  } else {
    incomeTax = Number((Math.max(0, account) * taxRate).toFixed(2));
  }
  const totalDeductions = loggedDeductions + adv + incomeTax;

  const netPay = totalEarnings - totalDeductions + bonusAmount;
  if (payoutMode !== "cash") cash = netPay - account;

  return {
    monthKey,
    periodLabel: getSalaryPeriodLabel(monthKey),
    usdRate,
    taxPercent: Number(taxPercent) || 0,
    monthlyGrossUsd: grossUsd,
    commissionPercent,
    commissionUsd,
    amountInPkr,
    basicSalary,
    fuelAllowance,
    totalEarnings,
    bonus: bonusAmount,
    lateFine: late,
    violationFine: violation,
    deductionsBreakdown: deductionItems,
    advance: adv,
    incomeTax,
    totalDeductions,
    netPay,
    cashAmount: cash,
    accountAmount: account,
  };
}
