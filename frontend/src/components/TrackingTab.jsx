import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import { getMonthLabel } from "../utils/slipCalc";
import { formatRange, getMonthWeekChunks } from "../utils/periods";
import {
  WEEKLY_GROSS_HISTORY,
  WEEKLY_GROSS_PERCENTAGES,
  WEEKLY_GROSS_USD,
  WEEKLY_TRACKING_HISTORY,
  WEEKLY_TRACKING_PERCENTAGES,
  WEEKLY_TRACKING_USD,
} from "../data/payrollHistory";

function percentageLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function percentageSummary(values) {
  const unique = [
    ...new Set(values.filter((value) => value != null).map(Number)),
  ];
  if (unique.length === 0) return "—";
  if (unique.length > 1) return "Mixed";
  return percentageLabel(unique[0]);
}

function fmtUsd(value) {
  return (
    "$" +
    (Number(value) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function TrackingTab({
  dispatchers,
  currency,
  usdPerPkr,
  trackingProperties,
  dataVersion,
}) {
  const [view, setView] = useState("weekly");
  const monthOptions = useMemo(() => {
    const keys = new Set();
    Object.values(WEEKLY_GROSS_USD).forEach((byMonth) => {
      Object.keys(byMonth).forEach((monthKey) => keys.add(monthKey));
    });
    return [...keys].sort().reverse();
  }, [dataVersion]);
  const [monthKey, setMonthKey] = useState("");

  useEffect(() => {
    if (!monthOptions.includes(monthKey)) setMonthKey(monthOptions[0] ?? "");
  }, [monthOptions, monthKey]);

  const rows = useMemo(() => {
    if (!monthKey) return [];
    const [year, month] = monthKey.split("-").map(Number);
    const weekChunks = getMonthWeekChunks(year, month - 1);
    const dispatchRows = [];

    dispatchers
      .filter((dispatcher) => dispatcher.employeeType === "dispatcher")
      .forEach((dispatcher) => {
        const usdWeeks = WEEKLY_GROSS_USD[dispatcher.id]?.[monthKey] ?? {};
        const pkrWeeks = WEEKLY_GROSS_HISTORY[dispatcher.id]?.[monthKey] ?? {};
        const trackingUsdWeeks =
          WEEKLY_TRACKING_USD[dispatcher.id]?.[monthKey] ?? {};
        const trackingPkrWeeks =
          WEEKLY_TRACKING_HISTORY[dispatcher.id]?.[monthKey] ?? {};
        const grossPercentWeeks =
          WEEKLY_GROSS_PERCENTAGES[dispatcher.id]?.[monthKey] ?? {};
        const trackingPercentWeeks =
          WEEKLY_TRACKING_PERCENTAGES[dispatcher.id]?.[monthKey] ?? {};
        const weeks = Object.keys(usdWeeks)
          .filter((weekField) => usdWeeks[weekField] != null)
          .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
        const weeklyRows = weeks.map((weekField) => {
          const weekNumber = Number(weekField.slice(4));
          const chunk = weekChunks.find(
            (week) => week.weekNumber === weekNumber,
          );
          const grossUsd = Number(usdWeeks[weekField]) || 0;
          const grossPercentage = Number(grossPercentWeeks[weekField]);
          return {
            dispatcherId: dispatcher.id,
            dispatcherName: dispatcher.alias || dispatcher.name,
            weekNumber,
            weekLabel: chunk
              ? `Week ${weekNumber} · ${formatRange(chunk.start, chunk.end)}`
              : `Week ${weekNumber}`,
            grossUsd,
            grossPkr: Number(pkrWeeks[weekField]) || 0,
            grossPercentage,
            driverRevenueUsd:
              grossPercentage > 0 ? grossUsd / (grossPercentage / 100) : 0,
            trackingPercentage: Number(trackingPercentWeeks[weekField]),
            trackingFeeUsd: Number(trackingUsdWeeks[weekField]) || 0,
            trackingFeePkr: Number(trackingPkrWeeks[weekField]) || 0,
          };
        });
        if (view === "weekly") {
          dispatchRows.push(...weeklyRows);
          return;
        }

        const grossUsd = weeklyRows.reduce((sum, row) => sum + row.grossUsd, 0);
        const grossPkr = weeklyRows.reduce((sum, row) => sum + row.grossPkr, 0);
        const driverRevenueUsd = weeklyRows.reduce(
          (sum, row) => sum + row.driverRevenueUsd,
          0,
        );
        dispatchRows.push({
          dispatcherId: dispatcher.id,
          dispatcherName: dispatcher.alias || dispatcher.name,
          grossUsd,
          grossPkr,
          grossPercentageLabel: percentageSummary(
            weeklyRows.map((row) => row.grossPercentage),
          ),
          driverRevenueUsd,
          trackingPercentageLabel: percentageSummary(
            weeklyRows.map((row) => row.trackingPercentage),
          ),
          trackingFeeUsd: weeklyRows.reduce(
            (sum, row) => sum + row.trackingFeeUsd,
            0,
          ),
          trackingFeePkr: weeklyRows.reduce(
            (sum, row) => sum + row.trackingFeePkr,
            0,
          ),
          weekCount: weeklyRows.length,
        });
      });

    return dispatchRows;
  }, [dispatchers, monthKey, view, dataVersion]);

  const displayMoney = (amountPkr, amountUsd) =>
    currency === "USD"
      ? fmtUsd(amountUsd)
      : fmtMoney(amountPkr, "PKR", usdPerPkr);

  const totalTrackingPkr = rows.reduce(
    (sum, row) => sum + row.trackingFeePkr,
    0,
  );
  const totalTrackingUsd = rows.reduce(
    (sum, row) => sum + row.trackingFeeUsd,
    0,
  );

  return (
    <div className="content-stack">
      <div className="panel panel-compact">
        <div className="section-head">
          <div>
            <div className="panel-title">Tracking income</div>
            <div className="panel-sub">
              Each week keeps the percentages used at sync time. Changing
              Settings affects future syncs.
            </div>
          </div>
        </div>
        <div className="pill-row tracking-rate-pills">
          <span className="soft-pill">
            Gross percentage:{" "}
            {percentageLabel(trackingProperties?.grossPercentage)}
          </span>
          <span className="soft-pill">
            Tracking percentage:{" "}
            {percentageLabel(trackingProperties?.trackingPercentage)}
          </span>
        </div>
        <div className="tracking-income-summary">
          <div>
            <span className="tracking-income-summary-label">
              Total tracking income
            </span>
            <span className="panel-sub">
              {monthKey ? getMonthLabel(monthKey) : "No period selected"}
            </span>
          </div>
          <strong>{displayMoney(totalTrackingPkr, totalTrackingUsd)}</strong>
        </div>
        <div className="period-picker-controls tracking-period-controls">
          <div className="period-picker-field">
            <span className="period-picker-label" id="tracking-view-label">
              View
            </span>
            <div
              className="pill-group"
              role="group"
              aria-labelledby="tracking-view-label"
            >
              <button
                type="button"
                className={view === "weekly" ? "active" : ""}
                onClick={() => setView("weekly")}
              >
                Weekly
              </button>
              <button
                type="button"
                className={view === "monthly" ? "active" : ""}
                onClick={() => setView("monthly")}
              >
                Monthly
              </button>
            </div>
          </div>
          <label className="period-picker-field">
            <span className="period-picker-label">Month</span>
            <span className="period-picker-select-wrap">
              <CalendarDays size={15} aria-hidden="true" />
              <select
                className="form-select period-picker-select"
                value={monthKey}
                disabled={monthOptions.length === 0}
                onChange={(event) => setMonthKey(event.target.value)}
                aria-label="Tracking month"
              >
                {monthOptions.length === 0 ? (
                  <option value="">No synced periods</option>
                ) : (
                  monthOptions.map((key) => (
                    <option key={key} value={key}>
                      {getMonthLabel(key)}
                    </option>
                  ))
                )}
              </select>
            </span>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="table-shell">
          {rows.length === 0 ? (
            <div className="empty-row">
              No synced tracking income for this period.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  {(view === "weekly"
                    ? [
                        "Dispatcher",
                        "Week",
                        "Gross",
                        "Gross %",
                        "Driver revenue (USD)",
                        "Tracking %",
                        "Tracking income",
                      ]
                    : [
                        "Dispatcher",
                        "Weeks",
                        "Gross",
                        "Gross %",
                        "Driver revenue (USD)",
                        "Tracking %",
                        "Tracking income",
                      ]
                  ).map((header) => (
                    <th key={header} className="table-head">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.dispatcherId}-${row.weekNumber ?? monthKey}`}>
                    <td className="table-cell table-cell-strong">
                      {row.dispatcherName}
                    </td>
                    <td className="table-cell">
                      {view === "weekly" ? row.weekLabel : row.weekCount}
                    </td>
                    <td className="table-cell">
                      {displayMoney(row.grossPkr, row.grossUsd)}
                    </td>
                    <td className="table-cell">
                      {view === "weekly"
                        ? percentageLabel(row.grossPercentage)
                        : row.grossPercentageLabel}
                    </td>
                    <td className="table-cell">
                      {fmtUsd(row.driverRevenueUsd)}
                    </td>
                    <td className="table-cell">
                      {view === "weekly"
                        ? percentageLabel(row.trackingPercentage)
                        : row.trackingPercentageLabel}
                    </td>
                    <td className="table-cell table-cell-strong">
                      {displayMoney(row.trackingFeePkr, row.trackingFeeUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
