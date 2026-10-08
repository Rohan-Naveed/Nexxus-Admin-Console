// Effective-rate lookups shared by payroll, tax, reports and slips.
//
// Rates are stored one row per month (Settings tab). A month with no row
// of its own uses the most recent EARLIER month's row until the admin
// sets one — and the notification bell tells the admin that's happening.
// `exact` says whether the month has its own row.

const periodOf = (year, month) => year * 12 + month;

function parseKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey ?? "");
  return match ? periodOf(Number(match[1]), Number(match[2])) : null;
}

function effectiveRow(rates, monthKey) {
  const target = parseKey(monthKey);
  if (target == null || !Array.isArray(rates)) return null;

  let best = null;
  let bestPeriod = -Infinity;
  for (const rate of rates) {
    const p = periodOf(rate.periodYear, rate.periodMonth);
    if (p <= target && p > bestPeriod) {
      best = rate;
      bestPeriod = p;
    }
  }
  if (!best) return null;
  return { row: best, exact: bestPeriod === target };
}

// PKR per 1 USD for a month: { ratePkrPerUsd, exact, fromKey } or null
// when no rate exists at or before that month.
export function getEffectiveUsdRate(usdRates, monthKey) {
  const found = effectiveRow(usdRates, monthKey);
  if (!found) return null;
  return {
    ratePkrPerUsd: Number(found.row.ratePkrPerUsd),
    exact: found.exact,
    fromKey: `${found.row.periodYear}-${String(found.row.periodMonth).padStart(2, "0")}`,
  };
}

// Tax percent for a month, or null when none is set at or before it.
export function getEffectiveTaxPercent(taxRates, monthKey) {
  const found = effectiveRow(taxRates, monthKey);
  return found ? Number(found.row.taxPercent) : null;
}

// Same as above but also says whether the month has its own row.
export function getEffectiveTaxInfo(taxRates, monthKey) {
  const found = effectiveRow(taxRates, monthKey);
  if (!found) return null;
  return {
    taxPercent: Number(found.row.taxPercent),
    exact: found.exact,
    fromKey: `${found.row.periodYear}-${String(found.row.periodMonth).padStart(2, "0")}`,
  };
}
