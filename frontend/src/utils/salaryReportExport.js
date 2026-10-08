import { jsPDF } from "jspdf";

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvSafe(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvSafe).join(",");
}

export function buildSalaryReportCsv(report) {
  const lines = [
    csvRow(["Nexxus Logistics"]),
    csvRow(["Salary Report", report.periodLabel]),
    csvRow(["Months with saved slips", report.includedMonths.length]),
    csvRow(["All amounts in PKR"]),
    "",
    csvRow([
      "Name of Employee",
      "CNIC",
      "Designation",
      "Total Salary",
      "Salary in Account",
      "Salary in Cash",
      "Tax Deducted",
    ]),
  ];

  report.rows.forEach((row) => {
    lines.push(
      csvRow([
        row.dispatcherName,
        row.cnic,
        row.designation,
        money(row.totalSalary),
        money(row.salaryInAccount),
        money(row.salaryInCash),
        money(row.taxDeducted),
      ]),
    );
  });

  lines.push(
    csvRow([
      "TOTAL",
      "",
      "",
      money(report.totals.totalSalary),
      money(report.totals.salaryInAccount),
      money(report.totals.salaryInCash),
      money(report.totals.taxDeducted),
    ]),
  );
  return lines.join("\r\n");
}

export function downloadSalaryReportCsv(report) {
  const blob = new Blob(["\ufeff", buildSalaryReportCsv(report)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safePeriod = report.periodLabel.replace(/[^a-z0-9]+/gi, "_");
  link.href = url;
  link.download = `nexxus_salary_report_${safePeriod}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildSalaryReportPdf(report) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const columnWidths = [48, 34, 40, 39, 39, 38, 35];
  const headers = [
    "Name of Employee",
    "CNIC",
    "Designation",
    "Total Salary",
    "Salary in Account",
    "Salary in Cash",
    "Tax Deducted",
  ];
  const rowHeight = 9;
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("NEXXUS LOGISTICS", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(12);
  doc.text("SALARY REPORT", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(report.periodLabel, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(
    `All amounts in PKR - ${report.includedMonths.length} month(s) with saved slips`,
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 8;

  function drawHeader() {
    doc.setFillColor(31, 111, 92);
    doc.rect(margin, y, tableWidth, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    headers.forEach((header, index) => {
      const align = index < 3 ? "left" : "right";
      const textX = index < 3 ? x + 2 : x + columnWidths[index] - 2;
      doc.text(header, textX, y + 7, {
        align,
        maxWidth: columnWidths[index] - 4,
      });
      x += columnWidths[index];
    });
    doc.setTextColor(24, 28, 32);
    y += 11;
  }

  drawHeader();
  const pdfRows = report.rows.map((row) => [
    row.dispatcherName,
    row.cnic || "-",
    row.designation || "-",
    money(row.totalSalary),
    money(row.salaryInAccount),
    money(row.salaryInCash),
    money(row.taxDeducted),
  ]);
  pdfRows.push([
    "TOTAL",
    "",
    "",
    money(report.totals.totalSalary),
    money(report.totals.salaryInAccount),
    money(report.totals.salaryInCash),
    money(report.totals.taxDeducted),
  ]);

  pdfRows.forEach((row, rowIndex) => {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    if (rowIndex === pdfRows.length - 1) {
      doc.setFillColor(231, 241, 235);
      doc.rect(margin, y, tableWidth, rowHeight, "F");
      doc.setFont("helvetica", "bold");
    } else {
      if (rowIndex % 2 === 1) {
        doc.setFillColor(246, 248, 246);
        doc.rect(margin, y, tableWidth, rowHeight, "F");
      }
      doc.setFont("helvetica", "normal");
    }
    doc.setDrawColor(210, 216, 212);
    doc.rect(margin, y, tableWidth, rowHeight);
    doc.setFontSize(8);
    let x = margin;
    row.forEach((value, index) => {
      const align = index < 3 ? "left" : "right";
      const textX = index < 3 ? x + 2 : x + columnWidths[index] - 2;
      doc.text(String(value), textX, y + 5.8, {
        align,
        maxWidth: columnWidths[index] - 4,
      });
      x += columnWidths[index];
    });
    y += rowHeight;
  });

  return doc;
}

export function downloadSalaryReportPdf(report) {
  const doc = buildSalaryReportPdf(report);
  const safePeriod = report.periodLabel.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`nexxus_salary_report_${safePeriod}.pdf`);
}
