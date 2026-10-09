import { Fragment } from "react";
import { fmtMoney } from "../utils/formatters";

export default function PayrollTab({
  payrollRows,
  currency,
  usdPerPkr,
  period,
  periodLabel,
  expenses,
  expenseCategories,
  summary,
  breakdown,
}) {
  const isWeekly = period === "Weekly";
  const profitPositive = summary.profit >= 0;
  const hasPartialRow = breakdown?.rows.some(
    (row) => row.reached && row.partial,
  );

  const expenseRows = expenseCategories
    .filter(
      (category) =>
        category.active || (expenses.byCategory?.[category.key] ?? 0) > 0,
    )
    .map((category) => ({
      key: category.key,
      label: category.label,
      amount: expenses.byCategory?.[category.key] ?? 0,
    }));
  const orderedPayrollRows = [
    ...payrollRows.filter((row) => row.employeeType === "dispatcher"),
    ...payrollRows.filter((row) => row.employeeType !== "dispatcher"),
  ];

  return (
    <div className="content-stack">
      {/* Total Gross / Payroll / Expenses / Profit KPIs live on the Reports
          tab now (src/components/ReportsTab.jsx) — this tab focuses on
          employee payroll detail and the weekly/monthly/yearly trend
          below instead of repeating the same four company-wide numbers. */}
      <div className="content-grid">
        <div className="panel panel-compact">
          <div className="section-head">
            <div>
              <div className="panel-title">Expenses · {periodLabel}</div>
              <div className="panel-sub">
                {isWeekly
                  ? "Expenses are recorded monthly and are not allocated across individual weeks."
                  : "Monthly totals across the configured expense categories."}
              </div>
            </div>
          </div>
          <div className="stack-list">
            {expenseRows.map(({ key, label, amount }) => (
              <div
                className="list-card list-card-compact expense-row"
                key={key}
              >
                <span className="list-card-title">{label}</span>
                <span className={`pill ${isWeekly ? "pill-muted" : ""}`}>
                  {isWeekly ? "Not allocated weekly" : fmtMoney(amount, currency, usdPerPkr)}
                </span>
              </div>
            ))}
            {expenseRows.length === 0 && (
              <div className="empty-row">No expense categories yet.</div>
            )}
          </div>
          <div
            className={`profit-banner ${profitPositive ? "" : "profit-banner-negative"}`}
          >
            <span>Net profit · {periodLabel}</span>
            <strong>{fmtMoney(summary.profit, currency, usdPerPkr)}</strong>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <div className="panel-title">Payroll overview</div>
              <div className="panel-sub">
                Dispatcher tracking income adds to company net profit and is not
                employee pay.
              </div>
            </div>
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  {[
                    "Employee",
                    `Gross · ${periodLabel}`,
                    "Base salary",
                    "Commission",
                    "Total earnings",
                    "Deductions",
                    "Net payout",
                    "Tracking income",
                  ].map((header) => (
                    <th key={header} className="table-head">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedPayrollRows.map((row, index) => (
                  <Fragment key={row.id}>
                    {index > 0 &&
                      row.employeeType !== "dispatcher" &&
                      orderedPayrollRows[index - 1].employeeType ===
                        "dispatcher" && (
                        <tr className="payroll-employee-divider">
                          <td className="table-cell" colSpan={8}>
                            Fixed-salary employees
                          </td>
                        </tr>
                      )}
                    <tr>
                      <td className="table-cell table-cell-strong">
                        {row.dispatcher}
                      </td>
                      <td className="table-cell">
                        {row.employeeType === "dispatcher"
                          ? fmtMoney(row.gross, currency, usdPerPkr)
                          : "—"}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.baseSalary, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {row.employeeType === "dispatcher"
                          ? fmtMoney(row.commission, currency, usdPerPkr)
                          : "—"}
                      </td>
                      <td className="table-cell table-cell-strong">
                        {fmtMoney(row.total, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {fmtMoney(row.deductions, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell table-cell-strong">
                        {fmtMoney(row.netPayout, currency, usdPerPkr)}
                      </td>
                      <td className="table-cell">
                        {row.employeeType === "dispatcher"
                          ? fmtMoney(row.trackingFee, currency, usdPerPkr)
                          : "—"}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {breakdown && (
        <div className="panel">
          <div className="section-head">
            <div>
              <div className="panel-title">
                {breakdown.kind === "weekly"
                  ? "Gross, tracking income, expenses, salary & profit — last 4 weeks"
                  : breakdown.kind === "monthly"
                    ? "Gross, tracking income, expenses, salary & profit — last 6 months"
                    : "Gross, tracking income, expenses, salary & profit — last 5 years"}
              </div>
              <div className="panel-sub">
                {breakdown.kind === "weekly"
                  ? "Synced from each dispatcher's sheet. Weeks not synced yet show no data."
                  : breakdown.kind === "monthly"
                    ? "Each month is the sum of whichever weeks have synced for it so far."
                    : "Year-over-year totals, oldest first."}
              </div>
            </div>
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  {[
                    breakdown.kind === "weekly"
                      ? "Week"
                      : breakdown.kind === "monthly"
                        ? "Month"
                        : "Year",
                    "Gross",
                    "Tracking income",
                    "Expenses",
                    "Salary",
                    "Profit",
                  ].map((header) => (
                    <th key={header} className="table-head">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      row.current
                        ? "table-row-current"
                        : !row.reached
                          ? "table-row-upcoming"
                          : ""
                    }
                  >
                    <td className="table-cell table-cell-strong">
                      {row.label}
                      {breakdown.kind === "weekly" && (
                        <span className="panel-sub" style={{ marginTop: 2 }}>
                          {row.rangeLabel}
                        </span>
                      )}
                      {row.current && (
                        <span
                          className="pill pill-route"
                          style={{ marginLeft: 8 }}
                        >
                          Current
                        </span>
                      )}
                      {row.partial && (
                        <span
                          className="pill pill-muted"
                          style={{ marginLeft: 8 }}
                        >
                          Syncing
                        </span>
                      )}
                    </td>
                    {row.reached ? (
                      <>
                        <td className="table-cell">
                          {fmtMoney(row.gross, currency, usdPerPkr)}
                        </td>
                        <td className="table-cell">
                          {fmtMoney(row.trackingFees, currency, usdPerPkr)}
                        </td>
                        <td className="table-cell">
                          {fmtMoney(row.expenses, currency, usdPerPkr)}
                        </td>
                        <td className="table-cell">
                          {fmtMoney(row.salary, currency, usdPerPkr)}
                        </td>
                        <td className="table-cell table-cell-strong">
                          {fmtMoney(row.profit, currency, usdPerPkr)}
                        </td>
                      </>
                    ) : (
                      <td className="table-cell" colSpan={5}>
                        Not synced yet
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="breakdown-note">
            {hasPartialRow && (
              <>
                The current month is still syncing — its totals only cover the
                weeks synced so far.{" "}
              </>
            )}
            Dispatcher salary uses synced gross and current commission rules;
            fixed-salary employees use their monthly base salary. Tracking
            income use the percentage snapshot saved with each synced week and
            add to company net profit without changing employee pay.
          </div>
        </div>
      )}
    </div>
  );
}
