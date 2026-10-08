import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { getMonthLabel } from "../utils/slipCalc";
import { buildSalaryReportData } from "../utils/salaryReportCalc";
import {
  downloadSalaryReportCsv,
  downloadSalaryReportPdf,
} from "../utils/salaryReportExport";

function pkr(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthRangeLabel(fromMonth, toMonth) {
  if (fromMonth === toMonth) return getMonthLabel(fromMonth);
  return `${getMonthLabel(fromMonth)} - ${getMonthLabel(toMonth)}`;
}

export default function SalaryReportTab({ slips, dataVersion }) {
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [exporting, setExporting] = useState(null);

  const monthOptions = useMemo(
    () =>
      [...new Set(slips.map((slip) => slip.monthKey).filter(Boolean))].sort(),
    [slips, dataVersion],
  );

  useEffect(() => {
    if (monthOptions.length === 0) {
      setFromMonth("");
      setToMonth("");
      return;
    }
    const latest = monthOptions[monthOptions.length - 1];
    if (!monthOptions.includes(fromMonth)) setFromMonth(latest);
    if (!monthOptions.includes(toMonth) || toMonth < fromMonth) {
      setToMonth(latest);
    }
  }, [monthOptions, fromMonth, toMonth]);

  const report = useMemo(() => {
    const data = buildSalaryReportData(slips, fromMonth, toMonth);
    if (!data) return null;

    return {
      periodLabel: monthRangeLabel(fromMonth, toMonth),
      selectedMonthCount:
        (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 +
        Number(toMonth.slice(5, 7)) -
        Number(fromMonth.slice(5, 7)) +
        1,
      ...data,
    };
  }, [slips, fromMonth, toMonth, dataVersion]);

  async function handleDownloadPdf() {
    if (!report?.rows.length) return;
    setExporting("pdf");
    try {
      await downloadSalaryReportPdf(report);
    } finally {
      setExporting(null);
    }
  }

  function handleDownloadCsv() {
    if (!report?.rows.length) return;
    setExporting("csv");
    try {
      downloadSalaryReportCsv(report);
    } finally {
      setExporting(null);
    }
  }

  const endMonthOptions = monthOptions.filter((month) => month >= fromMonth);

  return (
    <div className="content-stack">
      <section className="panel panel-compact">
        <div className="section-head salary-report-head">
          <div>
            <div className="panel-title">Salary report</div>
            <div className="panel-sub">
              All amounts are in PKR and reflect saved salary slips, including
              the account payout, cash remainder, and tax calculated from the
              requested account amount.
            </div>
          </div>
          <div className="salary-report-controls">
            <label className="form-group salary-report-period">
              <span className="form-label">From month</span>
              <select
                className="form-select"
                value={fromMonth}
                disabled={monthOptions.length === 0}
                onChange={(event) => {
                  const nextMonth = event.target.value;
                  setFromMonth(nextMonth);
                  if (toMonth < nextMonth) setToMonth(nextMonth);
                }}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {getMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group salary-report-period">
              <span className="form-label">Through month</span>
              <select
                className="form-select"
                value={toMonth}
                disabled={endMonthOptions.length === 0}
                onChange={(event) => setToMonth(event.target.value)}
              >
                {endMonthOptions.map((month) => (
                  <option key={month} value={month}>
                    {getMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <div className="salary-report-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleDownloadCsv}
                disabled={!report?.rows.length || exporting !== null}
              >
                <FileSpreadsheet size={14} />
                CSV
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleDownloadPdf}
                disabled={!report?.rows.length || exporting !== null}
              >
                {exporting === "pdf" ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Download size={14} />
                )}
                PDF
              </button>
            </div>
          </div>
        </div>
        {report?.rows.length > 0 && (
          <div className="pill-row">
            <span className="soft-pill">{report.periodLabel}</span>
            <span className="soft-pill">
              {report.includedMonths.length} month
              {report.includedMonths.length === 1 ? "" : "s"} with saved slips
            </span>
            <span className="soft-pill">
              {report.rows.length} employee
              {report.rows.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </section>

      <section className="panel">
        {!monthOptions.length ? (
          <div className="empty-row">
            No generated salary slips are available for reporting.
          </div>
        ) : !report?.rows.length ? (
          <div className="empty-row">
            No generated salary slips exist in the selected range.
          </div>
        ) : (
          <div className="table-shell">
            <table className="salary-report-table">
              <thead>
                <tr>
                  {[
                    "Name of Employee",
                    "CNIC",
                    "Designation",
                    "Total Salary",
                    "Salary in Account",
                    "Salary in Cash",
                    "Tax Deducted",
                  ].map((header, index) => (
                    <th
                      className={`table-head ${index >= 3 ? "salary-report-amount" : ""}`}
                      key={header}
                    >
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
                    <td className="table-cell">{row.cnic || "—"}</td>
                    <td className="table-cell">{row.designation || "—"}</td>
                    <td className="table-cell salary-report-amount table-cell-strong">
                      {pkr(row.totalSalary)}
                    </td>
                    <td className="table-cell salary-report-amount">
                      {pkr(row.salaryInAccount)}
                    </td>
                    <td className="table-cell salary-report-amount">
                      {pkr(row.salaryInCash)}
                    </td>
                    <td className="table-cell salary-report-amount">
                      {pkr(row.taxDeducted)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="table-cell table-cell-strong">TOTAL</td>
                  <td className="table-cell" />
                  <td className="table-cell" />
                  <td className="table-cell salary-report-amount table-cell-strong">
                    {pkr(report.totals.totalSalary)}
                  </td>
                  <td className="table-cell salary-report-amount table-cell-strong">
                    {pkr(report.totals.salaryInAccount)}
                  </td>
                  <td className="table-cell salary-report-amount table-cell-strong">
                    {pkr(report.totals.salaryInCash)}
                  </td>
                  <td className="table-cell salary-report-amount table-cell-strong">
                    {pkr(report.totals.taxDeducted)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
