// Builds and downloads a CSV export of one Tax-tab period. Same shape as
// reportExport.js's report CSV, kept as its own small file since the Tax
// report object (src/utils/taxCalc.js) has a different set of columns.

function toDisplay(amountPkr, currency, usdPerPkr) {
  if (currency !== "USD") return amountPkr;
  if (!(usdPerPkr > 0)) throw new Error("USD exchange rate is unavailable.");
  return amountPkr * usdPerPkr;
}

function csvSafe(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(cells) {
  return cells.map(csvSafe).join(",");
}

export function buildTaxCsv(
  report,
  { currency = "PKR", usdPerPkr = null } = {},
) {
  const fmt = (v) => toDisplay(v, currency, usdPerPkr).toFixed(2);
  const taxRateLabel = report.taxRateLabel ?? `${report.taxPercent}%`;
  const lines = [];

  lines.push(
    csvRow([
      "Nexxus Logistics",
      `${report.periodType} Tax Report - ${report.label}`,
    ]),
  );
  lines.push(csvRow([`Currency: ${currency}`, `Tax rate: ${taxRateLabel}`]));
  if (report.periodType === "Yearly" && report.hasDetail === false) {
    lines.push(
      csvRow(["Note: detailed tax history is not available for this year"]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Metric", "Amount"]));
  lines.push(csvRow(["Total Taxable Pay", fmt(report.taxableTotal)]));
  lines.push(csvRow(["Estimated Tax", fmt(report.taxTotal)]));
  lines.push("");

  lines.push(
    csvRow([
      "Dispatcher",
      "Base Salary",
      "Commission",
      "Fuel Allowance",
      "Taxable Pay",
      `Estimated Tax (${taxRateLabel})`,
    ]),
  );
  report.rows.forEach((row) => {
    lines.push(
      csvRow([
        row.dispatcherName,
        fmt(row.baseSalary),
        fmt(row.commission),
        fmt(row.fuelAllowance),
        fmt(row.taxableBase),
        fmt(row.tax),
      ]),
    );
  });

  if (report.periodType === "Yearly" && report.monthlyBreakdown?.length > 0) {
    lines.push("");
    lines.push(csvRow(["Monthly Breakdown"]));
    lines.push(csvRow(["Month", "Taxable Pay", "Estimated Tax"]));
    report.monthlyBreakdown.forEach((row) => {
      if (!row.reached) {
        lines.push(csvRow([row.label, "N/A", "N/A"]));
        return;
      }
      lines.push(csvRow([row.label, fmt(row.taxableTotal), fmt(row.taxTotal)]));
    });
  }

  return lines.join("\r\n");
}

export function downloadTaxCsv(report, opts) {
  const csv = buildTaxCsv(report, opts);
  // Leading BOM so Excel opens the UTF-8 file (₨ etc.) without mangling it.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeLabel = report.label.replace(/[^a-z0-9]+/gi, "_");
  a.download = `nexxus_${report.periodType.toLowerCase()}_tax_${safeLabel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
