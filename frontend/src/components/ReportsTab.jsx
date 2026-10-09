import { useMemo, useState } from "react";
import {
  TrendingUp,
  Wallet,
  TrendingDown,
  PiggyBank,
  Percent,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
} from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import { getAllMonthKeys, getMonthLabel } from "../utils/expenseCalc";
import { EXPENSE_CATEGORIES } from "../data/expenses";
import {
  getAvailableReportMonthKeys,
  getAvailableReportYears,
  getMonthlyReport,
  getYearlyReport,
} from "../utils/reportsCalc";
import { isMonthInProgressKey } from "../utils/periods";
import { downloadReportCsv } from "../utils/reportExport";
import { downloadReportPdf } from "../utils/pdfReport";
import KPICard from "./KPICard";
import RateWarning from "./RateWarning";
import PeriodPicker from "./PeriodPicker";

function fmtUsd(value) {
  return (
    "$" +
    (Number(value) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtCurrencyPair(amountPkr, amountUsd, currency, usdPerPkr) {
  return currency === "USD"
    ? fmtUsd(amountUsd)
    : fmtMoney(amountPkr, "PKR", usdPerPkr);
}

function EmployeeBreakdownTable({
  title,
  rows,
  fixedSalary = false,
  separatorBefore = false,
  currency,
  usdPerPkr,
}) {
  if (rows.length === 0) return null;

  const headers = fixedSalary
    ? [
        "Employee",
        "Base salary",
        "Salary earned",
        "Deductions",
        "Advance",
        "Tax",
        "Net pay",
      ]
    : [
        "Dispatcher",
        `Gross ${currency}`,
        "Base salary",
        `Commission ${currency}`,
        "Tracking income",
        "Fuel",
        "Salary earned",
        "Deductions",
        "Advance",
        "Tax",
        "Net pay",
      ];

  return (
    <div
      className={`content-stack ${separatorBefore ? "breakdown-section-separated" : ""}`}
    >
      <div className="panel-title">{title}</div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="table-head"
                  style={{ whiteSpace: "normal", minWidth: 76 }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dispatcherId}>
                <td className="table-cell table-cell-strong">
                  {row.dispatcherName}
                </td>
                {fixedSalary ? (
                  <>
                    <td className="table-cell">
                      {fmtMoney(row.baseSalary, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell table-cell-strong">
                      {fmtMoney(row.salary, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.deductions, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.advance, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.tax, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell table-cell-strong">
                      {fmtMoney(row.netPay, currency, usdPerPkr)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="table-cell">
                      {fmtCurrencyPair(
                        row.gross,
                        row.grossUsd,
                        currency,
                        usdPerPkr,
                      )}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.baseSalary, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtCurrencyPair(
                        row.commission,
                        row.commissionUsd,
                        currency,
                        usdPerPkr,
                      )}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.trackingFee, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.fuelAllowance, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell table-cell-strong">
                      {fmtMoney(row.salary, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.deductions, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.advance, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell">
                      {fmtMoney(row.tax, currency, usdPerPkr)}
                    </td>
                    <td className="table-cell table-cell-strong">
                      {fmtMoney(row.netPay, currency, usdPerPkr)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenseBreakdown({ report, currency, usdPerPkr }) {
  if (!report.expenseCategories) return null;
  const categories = Object.keys(report.expenseCategories).map((key) => [
    key,
    {
      label:
        report.expenseCategoryLabels?.[key] ??
        EXPENSE_CATEGORIES[key]?.label ??
        key,
    },
  ]);

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <div className="panel-title">
            {report.periodType === "Monthly"
              ? "Monthly expenses"
              : "Expense totals by category"}{" "}
            · {report.label}
          </div>
          <div className="panel-sub">
            Monthly totals grouped by expense category.
          </div>
        </div>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              {["Category", "Total"].map((header) => (
                <th key={header} className="table-head">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([key, category]) => (
              <tr key={key}>
                <td className="table-cell table-cell-strong">
                  {category.label}
                </td>
                <td className="table-cell">
                  {fmtMoney(
                    report.expenseCategories[key] ?? 0,
                    currency,
                    usdPerPkr,
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="table-cell table-cell-strong">Total</td>
              <td className="table-cell table-cell-strong">
                {fmtMoney(report.expenses, currency, usdPerPkr)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {report.expenseRows.length > 0 && (
        <div className="table-shell" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                {[
                  ...(report.periodType === "Yearly" ? ["Month"] : []),
                  "Date",
                  "Category",
                  "Details",
                  "Amount",
                ].map((header) => (
                  <th key={header} className="table-head">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.expenseRows.map((row, index) => (
                <tr
                  key={`${row.monthKey}-${row.date}-${row.category}-${index}`}
                >
                  {report.periodType === "Yearly" && (
                    <td className="table-cell">{row.monthLabel}</td>
                  )}
                  <td className="table-cell">{row.date}</td>
                  <td className="table-cell table-cell-strong">
                    {row.categoryLabel}
                  </td>
                  <td className="table-cell">{row.note || "—"}</td>
                  <td className="table-cell">
                    {fmtMoney(row.amount, currency, usdPerPkr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsTab({
  dispatchers,
  slips,
  expenseEntries,
  fineEntries,
  currency,
  usdPerPkr,
  taxPercent,
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

  const monthOptions = useMemo(
    () =>
      [
        ...new Set([
          ...getAvailableReportMonthKeys(dispatchers),
          ...getAllMonthKeys(expenseEntries),
          ...slips.map(
            (slip) =>
              slip.monthKey ??
              `${slip.periodYear}-${String(slip.periodMonth).padStart(2, "0")}`,
          ),
        ]),
      ]
        .sort()
        .reverse(),
    [dataVersion, dispatchers, expenseEntries, slips],
  );
  const yearOptions = useMemo(
    () =>
      [
        ...new Set([
          ...getAvailableReportYears(dispatchers),
          ...getAllMonthKeys(expenseEntries).map((key) =>
            Number(key.slice(0, 4)),
          ),
          ...slips.map((slip) =>
            Number(
              slip.monthKey?.slice(0, 4) ??
                String(slip.periodYear),
            ),
          ),
        ]),
      ].sort((a, b) => b - a),
    [dataVersion, dispatchers, expenseEntries, slips],
  );

  const report = useMemo(() => {
    if (!periodKey) return null;
    if (periodType === "Yearly") {
      return getYearlyReport(Number(periodKey), {
        dispatchers,
        expenseEntries,
        fineEntries,
        taxPercent,
        taxRates,
        salarySlips: slips,
      });
    }
    return getMonthlyReport(periodKey, {
      dispatchers,
      expenseEntries,
      fineEntries,
      taxPercent,
      taxRates,
      salarySlips: slips,
    });
  }, [
    periodType,
    periodKey,
    dispatchers,
    slips,
    expenseEntries,
    fineEntries,
    taxPercent,
    taxRates,
    dataVersion,
  ]);

  const historyList =
    periodType === "Yearly" ? yearOptions.map(String) : monthOptions;

  async function handleDownloadPdf() {
    if (!report) return;
    setExporting("pdf");
    try {
      await downloadReportPdf(report, { currency, usdPerPkr });
    } finally {
      setExporting(null);
    }
  }

  function handleDownloadCsv() {
    if (!report) return;
    downloadReportCsv(report, { currency, usdPerPkr });
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
        <div className="section-head period-section-head">
          <div>
            <div className="panel-title">Reports</div>
            <div className="panel-sub">
              Audit-ready gross, payroll, expense and profit summaries for any
              month or year on file — export as PDF or CSV for record-keeping.
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

      {!report || !report.reached ? (
        <div className="panel">
          <div className="empty-row">
            <Info size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            No synced data on file for this period yet.
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <KPICard
              label={`Total Gross \u00b7 ${report.label}`}
              value={fmtMoney(report.gross, currency, usdPerPkr)}
              sub="Dispatcher gross only"
              icon={TrendingUp}
            />
            <KPICard
              label={`Tracking income \u00b7 ${report.label}`}
              value={fmtMoney(report.trackingFees, currency, usdPerPkr)}
              sub="Tracking revenue generated from dispatcher gross"
              icon={Wallet}
            />
            <KPICard
              label={`Total salary earned \u00b7 ${report.label}`}
              value={fmtMoney(report.salaryEarned, currency, usdPerPkr)}
              sub="Employee earnings before deductions, advances and tax"
              icon={Wallet}
            />
            <KPICard
              label={`Expenses \u00b7 ${report.label}`}
              value={fmtMoney(report.expenses, currency, usdPerPkr)}
              sub={
                report.periodType === "Yearly" && report.hasDetail === false
                  ? "Not tracked for this year"
                  : "Misc., dinner & utility bills"
              }
              icon={TrendingDown}
            />
            <KPICard
              label={`Net Profit \u00b7 ${report.label}`}
              value={fmtMoney(report.profit, currency, usdPerPkr)}
              sub="Gross + tracking income − salary earned − expenses"
              icon={PiggyBank}
            />
            <KPICard
              label={`Tax withheld / estimated \u00b7 ${report.label}`}
              value={fmtMoney(report.tax, currency, usdPerPkr)}
              sub={
                report.periodType === "Monthly"
                  ? `Saved-slip tax is actual; unsaved current-month dispatcher rows assume full account payout at ${report.taxPercent}%`
                  : "Saved-slip tax is actual; unsaved current-month dispatcher rows use the effective rate and assume full account payout"
              }
              icon={Percent}
            />
          </div>

          <div className="panel">
            <div className="section-head">
              <div>
                <div className="panel-title">
                  Payroll breakdown — {report.label}
                </div>
                <div className="panel-sub">
                  Salary earned is before deductions, advances and tax. Net pay
                  shows the amount paid after those deductions. The Advance
                  column uses generated salary slips.
                </div>
              </div>
              <div className="pill-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handleDownloadCsv}
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

            <EmployeeBreakdownTable
              title={`Dispatcher payroll · ${report.label}`}
              rows={report.rows.filter(
                (row) => row.employeeType !== "employee",
              )}
              currency={currency}
              usdPerPkr={usdPerPkr}
            />
            <EmployeeBreakdownTable
              title={`Fixed-salary employees · ${report.label}`}
              rows={report.rows.filter(
                (row) => row.employeeType === "employee",
              )}
              fixedSalary
              separatorBefore={report.rows.some(
                (row) => row.employeeType !== "employee",
              )}
              currency={currency}
              usdPerPkr={usdPerPkr}
            />

            <div className="breakdown-note">
              Saved salary slips provide actual deductions, advances and tax.
              For current-month dispatchers without a generated slip, payroll
              assumes the available pay is paid to the account and estimates
              tax at the effective rate. Fixed-salary employees without a
              recorded slip show no tax deduction.
            </div>
          </div>

          {report.periodType === "Monthly" ? (
            <div className="panel">
              <div className="section-head">
                <div>
                  <div className="panel-title">
                    Weekly breakdown — {report.label}
                  </div>
                  <div className="panel-sub">
                    Gross and payroll are the actual synced figures for each
                    week; expenses are the miscellaneous entries recorded that
                    week (monthly dinner and bills count in month totals).
                  </div>
                </div>
              </div>

              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Week",
                        `Gross ${currency}`,
                        "Tracking income",
                        "Salary earned",
                        "Expenses",
                        "Deductions",
                      ].map((header) => (
                        <th key={header} className="table-head">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.weeklyBreakdown.map((week) => (
                      <tr key={week.key}>
                        <td className="table-cell table-cell-strong">
                          {week.label}
                          <span style={{ opacity: 0.6, fontWeight: 400 }}>
                            {" "}
                            · {week.rangeLabel}
                          </span>
                        </td>
                        {week.reached ? (
                          <>
                            <td className="table-cell">
                              {fmtCurrencyPair(
                                week.gross,
                                week.grossUsd,
                                currency,
                                usdPerPkr,
                              )}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(week.trackingFees, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(week.payroll, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(week.expenses, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(week.deductions, currency, usdPerPkr)}
                            </td>
                          </>
                        ) : (
                          <td
                            className="table-cell"
                            colSpan={5}
                            style={{ opacity: 0.6 }}
                          >
                            Not reached yet
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.billsTotal > 0 && (
                <div className="breakdown-note">
                  Monthly expense totals of{" "}
                  {fmtMoney(report.billsTotal, currency, usdPerPkr)} are entered
                  once per category, so they are included in the Expenses total
                  above but are not allocated to individual weeks here.
                </div>
              )}
            </div>
          ) : report.hasDetail ? (
            <div className="panel">
              <div className="section-head">
                <div>
                  <div className="panel-title">
                    Monthly breakdown — {report.label}
                  </div>
                  <div className="panel-sub">
                    Gross, payroll, expenses and deductions for each month of{" "}
                    {report.label}.
                  </div>
                </div>
              </div>

              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Month",
                        "Gross",
                        "Tracking income",
                        "Salary earned",
                        "Net payroll paid",
                        "Expenses",
                        "Deductions",
                        "Tax",
                        "Profit",
                      ].map((header) => (
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
                        {month.reached ? (
                          <>
                            <td className="table-cell">
                              {fmtMoney(month.gross, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(
                                month.trackingFees,
                                currency,
                                usdPerPkr,
                              )}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(
                                month.salaryEarned,
                                currency,
                                usdPerPkr,
                              )}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(month.payroll, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(month.expenses, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(month.deductions, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell">
                              {fmtMoney(month.tax, currency, usdPerPkr)}
                            </td>
                            <td className="table-cell table-cell-strong">
                              {fmtMoney(month.profit, currency, usdPerPkr)}
                            </td>
                          </>
                        ) : (
                          <td
                            className="table-cell"
                            colSpan={8}
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
          ) : null}
          <ExpenseBreakdown
            report={report}
            currency={currency}
            usdPerPkr={usdPerPkr}
          />
        </>
      )}
    </div>
  );
}
