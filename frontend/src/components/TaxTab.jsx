import { useMemo, useState } from "react";
import {
  Percent,
  PiggyBank,
  FileSpreadsheet,
  Download,
  Loader2,
  Info,
} from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import { getMonthLabel } from "../utils/expenseCalc";
import {
  getAvailableTaxMonthKeys,
  getAvailableTaxYears,
  getMonthlyTaxReport,
  getYearlyTaxReport,
  isMonthInProgressKey,
} from "../utils/taxCalc";
import { downloadTaxCsv } from "../utils/taxExport";
import { downloadTaxPdf } from "../utils/pdfTax";
import KPICard from "./KPICard";
import RateWarning from "./RateWarning";
import PeriodPicker from "./PeriodPicker";

export default function TaxTab({
  dispatchers,
  currency,
  usdPerPkr,
  taxRates,
  usdRates,
  dataVersion,
  onOpenSettings,
  periodType,
  periodKey,
  onPeriodTypeChange,
  onPeriodKeyChange,
}) {
  const [exporting, setExporting] = useState(null); // "pdf" | "csv" | null

  const monthOptions = useMemo(() => getAvailableTaxMonthKeys(), [dataVersion]);
  const yearOptions = useMemo(() => getAvailableTaxYears(), [dataVersion]);

  const report = useMemo(() => {
    if (!periodKey) return null;
    if (periodType === "Yearly") {
      return getYearlyTaxReport(Number(periodKey), { dispatchers, taxRates });
    }
    return getMonthlyTaxReport(periodKey, { dispatchers, taxRates });
  }, [periodType, periodKey, dispatchers, taxRates, dataVersion]);

  const historyList =
    periodType === "Yearly" ? yearOptions.map(String) : monthOptions;

  async function handleDownloadPdf() {
    if (!report) return;
    setExporting("pdf");
    try {
      await downloadTaxPdf(report, { currency, usdPerPkr });
    } finally {
      setExporting(null);
    }
  }

  function handleDownloadCsv() {
    if (!report) return;
    setExporting("csv");
    try {
      downloadTaxCsv(report, { currency, usdPerPkr });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="content-stack">
      {periodType === "Monthly" && (
        <RateWarning
          monthKey={periodKey}
          usdRates={usdRates}
          taxRates={taxRates}
          onOpenSettings={onOpenSettings}
        />
      )}
      <div className="panel panel-compact">
        <div className="section-head">
          <div>
            <div className="panel-title">Tax</div>
            <div className="panel-sub">
              {!report?.hasTaxRate
                ? "No tax rate is set yet. Add one in Settings."
                : `Estimated income tax at ${report.taxRateLabel} of base salary + commission + fuel allowance. Actual salary-slip tax is calculated from the requested account amount.`}
            </div>
          </div>
          <PeriodPicker
            periodType={periodType}
            periodKey={periodKey}
            options={historyList}
            onPeriodTypeChange={onPeriodTypeChange}
            onPeriodKeyChange={onPeriodKeyChange}
            formatOption={(key) =>
              periodType === "Yearly"
                ? key
                : `${getMonthLabel(key)}${isMonthInProgressKey(key) ? " (in progress)" : ""}`
            }
          />
        </div>
      </div>

      {!report?.hasTaxRate || !report.reached ? (
        <div className="panel">
          <div className="empty-row">
            <Info size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            {!report?.hasTaxRate
              ? "No tax rate is configured for this period."
              : "No synced data on file for this period yet."}
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <KPICard
              label={`Taxable Pay \u00b7 ${report.label}`}
              value={fmtMoney(report.taxableTotal, currency, usdPerPkr)}
              sub="Base salary + commission + fuel allowance, all dispatchers"
              icon={PiggyBank}
            />
            <KPICard
              label={`Estimated Tax \u00b7 ${report.label}`}
              value={fmtMoney(report.taxTotal, currency, usdPerPkr)}
              sub={`Rate: ${report.taxRateLabel}`}
              icon={Percent}
            />
          </div>

          <div className="panel">
            <div className="section-head">
              <div>
                <div className="panel-title">
                  Dispatcher breakdown — {report.label}
                </div>
                <div className="panel-sub">
                  Taxable pay and tax withheld for each dispatcher.
                </div>
              </div>
              <div className="pill-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handleDownloadCsv}
                  disabled={exporting === "csv"}
                >
                  <FileSpreadsheet size={14} />
                  CSV
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleDownloadPdf}
                  disabled={exporting === "pdf"}
                >
                  {exporting === "pdf" ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {exporting === "pdf" ? "Preparing\u2026" : "PDF"}
                </button>
              </div>
            </div>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    {[
                      "Dispatcher",
                      "Base Salary",
                      "Commission",
                      "Fuel Allow.",
                      "Taxable Pay",
                      "Estimated Tax",
                    ].map((header) => (
                      <th key={header} className="table-head">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.dispatcherId}>
                      <td className="table-cell table-cell-strong">
                        {row.dispatcherName}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.baseSalary, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.commission, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.fuelAllowance, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.taxableBase, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell table-cell-strong">
                        {fmtMoney(row.tax, currency, usdPerPkr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.periodType === "Yearly" && report.hasDetail && (
            <div className="panel">
              <div className="section-head">
                <div>
                  <div className="panel-title">
                    Monthly breakdown — {report.label}
                  </div>
                  <div className="panel-sub">
                    Taxable pay and tax withheld for each month of{" "}
                    {report.label}.
                  </div>
                </div>
              </div>

              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      {["Month", "Taxable Pay", "Estimated Tax"].map((header) => (
                        <th key={header} className="table-head">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthlyBreakdown.map((month) => (
                      <tr key={month.key}>
                        <td className="table-cell table-cell-strong">
                          {month.shortLabel}
                        </td>
                        {month.reached && month.hasTaxRate ? (
                          <>
                            <td className="table-cell">
                              {fmtMoney(
                                month.taxableTotal,
                                currency,
                                usdPerPkr,
                              )}
                            </td>
                            <td className="table-cell table-cell-strong">
                              {fmtMoney(month.taxTotal, currency, usdPerPkr)}
                            </td>
                          </>
                        ) : !month.hasTaxRate ? (
                          <td className="table-cell" colSpan={2}>
                            No rate configured
                          </td>
                        ) : (
                          <td
                            className="table-cell"
                            colSpan={2}
                            style={{ opacity: 0.6 }}
                          >
                            No synced data
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
