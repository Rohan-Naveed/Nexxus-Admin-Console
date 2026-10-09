import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { getMonthLabel } from "../utils/slipCalc";
import {
  getAvailableSlipMonthKeys,
  isCurrentSyncingMonth,
} from "../utils/payrollHistoryCalc";
import SlipPreviewCard from "./SlipPreviewCard";
import SlipHistoryList from "./SlipHistoryList";
import SlipActivityHistory from "./SlipActivityHistory";
import RateWarning from "./RateWarning";
import { getEffectiveUsdRate, getEffectiveTaxPercent } from "../utils/rates";

export default function SalarySlipsTab({
  dispatchers,
  slips,
  slipHistory,
  monthKey,
  onMonthKeyChange,
  usdRates,
  taxRates,
  fallbackUsdPerPkr,
  fallbackTaxPercent,
  dataVersion,
  fineEntries,
  deductionCategories,
  onGenerateSlip,
  onSendSlip,
  onOpenSettings,
}) {
  // A slip uses the dollar rate and tax rate of ITS OWN month (gross is
  // stored in USD and converted with that month's rate). A month with no
  // rate of its own uses the most recent earlier one — the warning below
  // says so. With no rate at all, generating is blocked.
  const usdRate = getEffectiveUsdRate(usdRates, monthKey);
  const usdPerPkr = usdRate ? 1 / usdRate.ratePkrPerUsd : null;
  const taxPercent = getEffectiveTaxPercent(taxRates, monthKey);
  const blockReason =
    !usdRate &&
    dispatchers.some((person) => person.employeeType === "dispatcher")
      ? "Set a dollar rate in Settings before generating slips."
      : "";
  void fallbackUsdPerPkr;
  void fallbackTaxPercent;
  // Only months with at least some synced gross data are offered — see
  // src/utils/payrollHistoryCalc.js#getAvailableSlipMonthKeys. The
  // in-progress current month IS included (a dispatcher leaving or
  // starting mid-month may still need a slip for it), just labelled
  // clearly so it isn't mistaken for a closed-out month.
  const monthOptions = useMemo(
    () => getAvailableSlipMonthKeys(dispatchers, slips),
    [dispatchers, slips, dataVersion],
  );

  const slipsForMonth = useMemo(() => {
    const map = new Map();
    slips
      .filter((slip) => slip.monthKey === monthKey)
      .forEach((slip) => map.set(slip.dispatcherId, slip));
    return map;
  }, [slips, monthKey]);

  return (
    <div className="content-stack">
      <RateWarning
        monthKey={monthKey}
        usdRates={usdRates}
        taxRates={taxRates}
        onOpenSettings={onOpenSettings}
      />
      <div className="panel panel-compact">
        <div className="section-head period-section-head">
          <div>
            <div className="panel-title">Salary slips</div>
            <div className="panel-sub">
              Pick a month, review each employee's pay below, then generate.
              Dispatchers need synced gross; fixed-salary employees do not.
            </div>
          </div>
          <label className="period-picker-field">
            <span className="period-picker-label">Month</span>
            <span className="period-picker-select-wrap">
              <CalendarDays size={15} aria-hidden="true" />
              <select
                className="form-select period-picker-select salary-period-select"
                value={monthKey ?? ""}
                disabled={monthOptions.length === 0}
                onChange={(event) => onMonthKeyChange(event.target.value)}
                aria-label="Select salary slip month"
              >
                {monthOptions.length === 0 && (
                  <option value="" disabled>
                    No synced periods
                  </option>
                )}
                {monthOptions.map((key) => (
                  <option key={key} value={key}>
                    {getMonthLabel(key)}
                    {isCurrentSyncingMonth(key) ? " (in progress)" : ""}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </div>

      <div className="content-stack">
        {monthKey ? (
          dispatchers.map((dispatcher) => (
            <SlipPreviewCard
              key={`${dispatcher.id}-${monthKey}-${dataVersion}`}
              dispatcher={dispatcher}
              monthKey={monthKey}
              usdPerPkr={usdPerPkr ?? 0}
              taxPercent={taxPercent}
              blockReason={blockReason}
              existingSlip={slipsForMonth.get(dispatcher.id) ?? null}
              fineEntries={fineEntries}
              deductionCategories={deductionCategories}
              onGenerate={onGenerateSlip}
              onSendSlip={onSendSlip}
            />
          ))
        ) : (
          <div className="empty-row">
            No employee payroll periods are available yet.
          </div>
        )}
      </div>

      <SlipHistoryList slips={slips} dispatchers={dispatchers} />
      <SlipActivityHistory events={slipHistory} dispatchers={dispatchers} />
    </div>
  );
}
