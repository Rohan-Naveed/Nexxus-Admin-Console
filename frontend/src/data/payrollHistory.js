// The payroll store: every synced week, held in memory for the whole app.
//
// SOURCE OF TRUTH: the payroll_weeks table (filled by the Google Sheets
// sync, see the Sync Center). Gross is stored in USD, exactly as in the
// sheet. AdminConsole loads the rows and calls setPayrollData(); after
// that the rest of the app reads these objects like it always did.
//
//   WEEKLY_GROSS_USD      { [dispatcherId]: { "YYYY-MM": { week1: usd, week2: usd, ... } } }
//   WEEKLY_GROSS_HISTORY  same shape, in PKR — each week converted with the
//                         USD->PKR rate of the month it belongs to
//   YEARLY_GROSS_HISTORY  { [dispatcherId]: { [year]: pkr } } (sum of the above)
//
// The month key is the month the week is LABELLED with in the Week
// Calendar. A week with no dollar rate at or before its month can't be
// converted, so its PKR value is null (treated as "not synced" by the
// calculations) until the admin sets a rate; the USD value is still kept.
//
// The objects are cleared and refilled IN PLACE, so modules that imported
// them keep seeing fresh data. AdminConsole bumps a version after each
// load so memoised views recompute.

import { getEffectiveUsdRate } from "../utils/rates";

export const WEEKLY_GROSS_USD = {};
export const WEEKLY_GROSS_HISTORY = {};
export const WEEKLY_TRACKING_USD = {};
export const WEEKLY_TRACKING_HISTORY = {};
export const WEEKLY_GROSS_PERCENTAGES = {};
export const WEEKLY_TRACKING_PERCENTAGES = {};
export const YEARLY_GROSS_HISTORY = {};

let usdRatesStore = [];

function clear(object) {
  Object.keys(object).forEach((key) => delete object[key]);
}

// weeks: [{ dispatcherId, periodYear, periodMonth, weekNumber, grossAmount }]
// usdRates: [{ periodYear, periodMonth, ratePkrPerUsd }]
export function setPayrollData({ weeks = [], usdRates = [] } = {}) {
  clear(WEEKLY_GROSS_USD);
  clear(WEEKLY_GROSS_HISTORY);
  clear(WEEKLY_TRACKING_USD);
  clear(WEEKLY_TRACKING_HISTORY);
  clear(WEEKLY_GROSS_PERCENTAGES);
  clear(WEEKLY_TRACKING_PERCENTAGES);
  clear(YEARLY_GROSS_HISTORY);
  usdRatesStore = usdRates;

  const rateCache = new Map();
  const rateFor = (monthKey) => {
    if (!rateCache.has(monthKey))
      rateCache.set(monthKey, getEffectiveUsdRate(usdRates, monthKey));
    return rateCache.get(monthKey);
  };

  weeks.forEach((w) => {
    if (w.grossAmount == null) return;
    const monthKey = `${w.periodYear}-${String(w.periodMonth).padStart(2, "0")}`;
    const field = `week${w.weekNumber}`;

    WEEKLY_GROSS_USD[w.dispatcherId] ??= {};
    WEEKLY_GROSS_USD[w.dispatcherId][monthKey] ??= {};
    WEEKLY_GROSS_USD[w.dispatcherId][monthKey][field] = w.grossAmount;
    WEEKLY_TRACKING_USD[w.dispatcherId] ??= {};
    WEEKLY_TRACKING_USD[w.dispatcherId][monthKey] ??= {};
    WEEKLY_TRACKING_USD[w.dispatcherId][monthKey][field] =
      w.trackingFeeAmount ?? null;
    WEEKLY_GROSS_PERCENTAGES[w.dispatcherId] ??= {};
    WEEKLY_GROSS_PERCENTAGES[w.dispatcherId][monthKey] ??= {};
    WEEKLY_GROSS_PERCENTAGES[w.dispatcherId][monthKey][field] =
      w.grossPercentage ?? null;
    WEEKLY_TRACKING_PERCENTAGES[w.dispatcherId] ??= {};
    WEEKLY_TRACKING_PERCENTAGES[w.dispatcherId][monthKey] ??= {};
    WEEKLY_TRACKING_PERCENTAGES[w.dispatcherId][monthKey][field] =
      w.trackingPercentage ?? null;

    const rate = rateFor(monthKey);
    const pkr = rate ? w.grossAmount * rate.ratePkrPerUsd : null;

    WEEKLY_GROSS_HISTORY[w.dispatcherId] ??= {};
    WEEKLY_GROSS_HISTORY[w.dispatcherId][monthKey] ??= {};
    WEEKLY_GROSS_HISTORY[w.dispatcherId][monthKey][field] = pkr;

    WEEKLY_TRACKING_HISTORY[w.dispatcherId] ??= {};
    WEEKLY_TRACKING_HISTORY[w.dispatcherId][monthKey] ??= {};
    const trackingFee = w.trackingFeeAmount;
    WEEKLY_TRACKING_HISTORY[w.dispatcherId][monthKey][field] =
      rate && trackingFee != null ? trackingFee * rate.ratePkrPerUsd : null;

    if (pkr != null) {
      YEARLY_GROSS_HISTORY[w.dispatcherId] ??= {};
      YEARLY_GROSS_HISTORY[w.dispatcherId][w.periodYear] =
        (YEARLY_GROSS_HISTORY[w.dispatcherId][w.periodYear] ?? 0) + pkr;
    }
  });
}

export function getStoredUsdRates() {
  return usdRatesStore;
}
