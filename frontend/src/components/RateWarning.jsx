import { AlertTriangle } from "lucide-react";
import { getEffectiveUsdRate, getEffectiveTaxInfo } from "../utils/rates";
import { getMonthLabel } from "../utils/slipCalc";

// One-line heads-up when the month being viewed has no dollar rate and/or
// tax rate of its own. Amounts still work — they use the most recent
// earlier rate — but the admin should set the month's rate in Settings.
export default function RateWarning({
  monthKey,
  usdRates,
  taxRates,
  checkUsd = true,
  checkTax = true,
  onOpenSettings,
}) {
  if (!monthKey) return null;

  const problems = [];
  if (checkUsd) {
    const usd = getEffectiveUsdRate(usdRates, monthKey);
    if (!usd) {
      problems.push("no dollar rate is set, so dollar amounts can't be converted to PKR");
    } else if (!usd.exact) {
      problems.push(`the dollar rate isn't set for ${getMonthLabel(monthKey)} (using ${getMonthLabel(usd.fromKey)}: ${usd.ratePkrPerUsd})`);
    }
  }
  if (checkTax) {
    const tax = getEffectiveTaxInfo(taxRates, monthKey);
    if (!tax) {
      problems.push("no tax rate is set");
    } else if (!tax.exact) {
      problems.push(`the tax rate isn't set for ${getMonthLabel(monthKey)} (using ${getMonthLabel(tax.fromKey)}: ${tax.taxPercent}%)`);
    }
  }
  if (problems.length === 0) return null;

  return (
    <div className="sync-warning">
      <AlertTriangle size={15} />
      <span>
        For {getMonthLabel(monthKey)}: {problems.join("; ")}.{" "}
        {onOpenSettings && (
          <button className="text-link" onClick={onOpenSettings}>
            Open Settings
          </button>
        )}
      </span>
    </div>
  );
}
