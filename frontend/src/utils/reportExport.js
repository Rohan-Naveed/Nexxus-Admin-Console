// Builds a summary, employee breakdowns and category totals for CSV export.
// Yearly exports also include a monthly breakdown; monthly exports omit the
// weekly detail. Consumes the report shape returned by reportsCalc.js.
import { EXPENSE_CATEGORIES } from "../data/expenses";

function csvSafe(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(cells) {
  return cells.map(csvSafe).join(",");
}

export function buildReportCsv(report) {
  const usd = (value) => `$${(Number(value) || 0).toFixed(2)}`;
  const pkr = (value) => `PKR ${(Number(value) || 0).toFixed(2)}`;
  const lines = [];

  lines.push(
    csvRow([
      "Nexxus Logistics",
      `${report.periodType} Report - ${report.label}`,
    ]),
  );
  lines.push(csvRow(["Gross and commission: USD; all other amounts: PKR"]));
  if (report.periodType === "Yearly" && report.hasDetail === false) {
    lines.push(
      csvRow(["Note: expense/deduction logs are not available for this year"]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Metric", "Amount"]));
  lines.push(csvRow(["Total Gross (USD)", usd(report.grossUsd)]));
  lines.push(csvRow(["Tracking Income (PKR)", pkr(report.trackingFees)]));
  lines.push(csvRow(["Net Payroll Paid (PKR)", pkr(report.payroll)]));
  lines.push(csvRow(["Total Expenses (PKR)", pkr(report.expenses)]));
  lines.push(csvRow(["Payroll Deductions (PKR)", pkr(report.deductions)]));
  lines.push(csvRow(["Advances Deducted (PKR)", pkr(report.advances)]));
  lines.push(
    csvRow(["Tax Withheld / Estimated (PKR)", pkr(report.tax)]),
  );
  lines.push(csvRow(["Net Profit (PKR)", pkr(report.profit)]));
  lines.push("");

  const dispatcherRows = report.rows.filter(
    (row) => row.employeeType !== "employee",
  );
  const employeeRows = report.rows.filter(
    (row) => row.employeeType === "employee",
  );
  if (dispatcherRows.length > 0) {
    lines.push(csvRow(["Dispatcher Breakdown"]));
    lines.push(
      csvRow([
        "Dispatcher",
        "Gross",
        "Base Salary",
        "Commission",
        "Tracking Income",
        "Fuel Allowance",
        "Deductions",
        "Advance",
        "Tax",
        "Net Pay",
      ]),
    );
  }
  dispatcherRows.forEach((row) => {
    lines.push(
      csvRow([
        row.dispatcherName,
        usd(row.grossUsd),
        pkr(row.baseSalary),
        usd(row.commissionUsd),
        pkr(row.trackingFee),
        pkr(row.fuelAllowance),
        pkr(row.deductions),
        pkr(row.advance),
        pkr(row.tax),
        pkr(row.netPay),
      ]),
    );
  });
  if (employeeRows.length > 0) {
    lines.push("");
    lines.push(csvRow(["Fixed-Salary Employee Breakdown"]));
    lines.push(
      csvRow([
        "Employee",
        "Base Salary",
        "Deductions",
        "Advance",
        "Tax",
        "Net Pay",
      ]),
    );
    employeeRows.forEach((row) => {
      lines.push(
        csvRow([
          row.dispatcherName,
          pkr(row.baseSalary),
          pkr(row.deductions),
          pkr(row.advance),
          pkr(row.tax),
          pkr(row.netPay),
        ]),
      );
    });
  }

  const breakdownRows = report.monthlyBreakdown;

  if (report.periodType === "Yearly" && breakdownRows?.length > 0) {
    lines.push("");
    lines.push(csvRow(["Monthly Breakdown"]));
    lines.push(
      csvRow([
        "Period",
        "Gross",
        "Tracking Income",
        "Net Payroll Paid",
        "Expenses",
        "Deductions",
        "Tax",
        "Profit",
      ]),
    );
    breakdownRows.forEach((row) => {
      const periodLabel = row.label;
      if (!row.reached) {
        lines.push(csvRow([periodLabel, ...Array(7).fill("N/A")]));
        return;
      }
      const cells = [
        periodLabel,
        usd(row.grossUsd),
        pkr(row.trackingFees),
        pkr(row.payroll),
        pkr(row.expenses),
        pkr(row.deductions),
        pkr(row.tax),
        pkr(row.profit),
      ];
      lines.push(csvRow(cells));
    });
  }

  lines.push("");
  lines.push(
    csvRow([
      report.periodType === "Monthly"
        ? "Monthly Expense Totals"
        : "Expense Totals by Category",
    ]),
  );
  lines.push(csvRow(["Category", "Amount"]));
  Object.entries(report.expenseCategories ?? {}).forEach(
    ([category, amount]) => {
      lines.push(
        csvRow([EXPENSE_CATEGORIES[category]?.label ?? category, pkr(amount)]),
      );
    },
  );
  lines.push(csvRow(["Total Expenses", pkr(report.expenses)]));
  return lines.join("\r\n");
}

export function downloadReportCsv(report, opts) {
  const csv = buildReportCsv(report, opts);
  // Leading BOM so Excel opens the UTF-8 file (₨ etc.) without mangling it.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeLabel = report.label.replace(/[^a-z0-9]+/gi, "_");
  a.download = `nexxus_${report.periodType.toLowerCase()}_report_${safeLabel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
