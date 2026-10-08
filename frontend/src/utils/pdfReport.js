// Renders a Monthly/Yearly financial report to PDF using jsPDF — the same
// company-branded header/frame as src/utils/pdfSlip.js, followed by a
// summary block and a paginated per-dispatcher breakdown table. Takes the
// report object shape returned by src/utils/reportsCalc.js.
import { jsPDF } from "jspdf";
import logoSrc from "../assets/logo.jpeg";
import { EXPENSE_CATEGORIES } from "../data/expenses";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ROUTE_COLOR = [31, 111, 92]; // matches --route
const BRICK_COLOR = [166, 66, 59]; // matches --brick
const INK_COLOR = [24, 28, 32];

function money(n, currency) {
  const v = Number(n) || 0;
  const symbol = currency === "USD" ? "$" : "Rs ";
  const decimals = currency === "USD" ? 2 : 0;
  return (
    symbol +
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function loadImageDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", 0.95),
        ratio: img.naturalHeight / img.naturalWidth,
      });
    };
    img.onerror = () => reject(new Error("Could not load logo image"));
    img.src = src;
  });
}

function sectionTitle(doc, text, y) {
  doc.setDrawColor(20);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK_COLOR);
  doc.text(text, PAGE_W / 2, y + 7, { align: "center" });
  doc.line(MARGIN, y + 10, PAGE_W - MARGIN, y + 10);
  return y + 10;
}

// Bordered label:value rows, value right-aligned (report figures read
// better right-aligned than pdfSlip.js's left-aligned employee-info
// table, since these are always numbers).
function keyValueTable(doc, { x, y, width, rows, labelWidth }) {
  const rowH = 7.2;
  const lw = labelWidth ?? width * 0.5;

  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.rect(x, ry, lw, rowH);
    doc.rect(x + lw, ry, width - lw, rowH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...(row.labelColor ?? INK_COLOR));
    doc.text(row.label, x + 2.2, ry + rowH / 2 + 1.1);

    doc.setFont("helvetica", row.valueBold ? "bold" : "normal");
    doc.setTextColor(...(row.valueColor ?? INK_COLOR));
    doc.text(String(row.value), x + width - 2.2, ry + rowH / 2 + 1.1, {
      align: "right",
    });
  });

  doc.setTextColor(...INK_COLOR);
  return y + rows.length * rowH;
}

// Paginated data table: draws a header row + body rows, starting a new
// page (with the header repeated) whenever a row would run past the
// bottom margin. Returns the y position just after the table.
function dataTable(doc, { x, y, colWidths, headers, rows }) {
  const rowH = 7.5;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const headerLines = headers.map((header, index) =>
    doc.splitTextToSize(header, colWidths[index] - 4),
  );
  const headerH = Math.max(
    9,
    ...headerLines.map((lines) => lines.length * 3.6 + 3),
  );

  function drawHeader(atY) {
    doc.setFillColor(...ROUTE_COLOR);
    doc.rect(x, atY, tableW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let cx = x;
    headers.forEach((h, i) => {
      const align = i === 0 ? "left" : "right";
      const tx = i === 0 ? cx + 2.2 : cx + colWidths[i] - 2.2;
      const text = headerLines[i];
      doc.text(text, tx, atY + (headerH - text.length * 3.6) / 2 + 3, {
        align,
        maxWidth: colWidths[i] - 4,
      });
      cx += colWidths[i];
    });
    doc.setTextColor(...INK_COLOR);
    return atY + headerH;
  }

  let cursorY = drawHeader(y);

  rows.forEach((row, ri) => {
    if (cursorY + rowH > PAGE_H - MARGIN) {
      doc.addPage();
      cursorY = drawHeader(MARGIN);
    }
    if (ri % 2 === 1) {
      doc.setFillColor(244, 244, 240);
      doc.rect(x, cursorY, tableW, rowH, "F");
    }
    doc.setDrawColor(215);
    doc.setLineWidth(0.15);
    doc.rect(x, cursorY, tableW, rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_COLOR);
    let cx = x;
    row.forEach((cell, i) => {
      const align = i === 0 ? "left" : "right";
      const tx = i === 0 ? cx + 2.2 : cx + colWidths[i] - 2.2;
      doc.text(String(cell), tx, cursorY + rowH / 2 + 1.1, { align });
      cx += colWidths[i];
    });
    cursorY += rowH;
  });

  return cursorY;
}

export async function generateReportPdf(
  report,
  { currency = "PKR", usdPerPkr = null } = {},
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Outer border, mirroring the salary slip's framed page.
  doc.setDrawColor(20);
  doc.setLineWidth(0.6);
  doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, PAGE_H - (MARGIN - 5) * 2);

  // Header: logo (left) + company info (right)
  const logoW = 42;
  let logoH = 20;
  try {
    const { dataUrl, ratio } = await loadImageDataUrl(logoSrc);
    logoH = logoW * ratio;
    doc.addImage(dataUrl, "JPEG", MARGIN, MARGIN, logoW, logoH);
  } catch {
    // Logo failed to load (e.g. offline) — report still generates without it.
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK_COLOR);
  const infoX = MARGIN + 64;
  let infoY = MARGIN + 3;
  [
    "602B Block L Sabazar Lahore",
    "(042) 355 25009",
    "https://www.nexxusdispatch.com",
    "Accounts@nexxusdispatch.com",
  ].forEach((line) => {
    doc.text(line, infoX, infoY);
    infoY += 5.2;
  });

  let y = MARGIN + Math.max(logoH, infoY - MARGIN) + 6;

  const title =
    report.periodType === "Monthly"
      ? `MONTHLY REPORT \u2014 ${report.label.toUpperCase()}`
      : `YEARLY REPORT \u2014 ${report.label}`;
  y = sectionTitle(doc, title, y);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    "Gross and commission in USD; all other amounts in PKR",
    PAGE_W / 2,
    y + 5,
    {
      align: "center",
    },
  );
  doc.setTextColor(...INK_COLOR);
  y += 12;

  y = sectionTitle(doc, "SUMMARY", y) + 6;

  const summaryW = 132;
  const summaryX = (PAGE_W - summaryW) / 2;
  y = keyValueTable(doc, {
    x: summaryX,
    y,
    width: summaryW,
    labelWidth: summaryW * 0.55,
    rows: [
      {
        label: "Total Gross",
        value: money(report.grossUsd, "USD"),
        labelColor: ROUTE_COLOR,
        valueColor: ROUTE_COLOR,
      },
      {
        label: "Tracking Income",
        value: money(report.trackingFees, "PKR"),
      },
      {
        label: "Net Payroll Paid",
        value: money(report.payroll, "PKR"),
      },
      {
        label: "Total Expenses",
        value: money(report.expenses, "PKR"),
      },
      {
        label: "Payroll Deductions",
        value: money(report.deductions, "PKR"),
      },
      {
        label: "Advances Deducted",
        value: money(report.advances, "PKR"),
      },
      {
        label: "Tax Withheld / Estimated",
        value: money(report.tax, "PKR"),
      },
      {
        label: "Net Profit",
        value: money(report.profit, "PKR"),
        valueBold: true,
        labelColor: report.profit >= 0 ? ROUTE_COLOR : BRICK_COLOR,
        valueColor: report.profit >= 0 ? ROUTE_COLOR : BRICK_COLOR,
      },
    ],
  });

  y += 10;
  y += 6;

  const dispatcherRows = report.rows.filter(
    (row) => row.employeeType !== "employee",
  );
  const employeeRows = report.rows.filter(
    (row) => row.employeeType === "employee",
  );

  if (dispatcherRows.length > 0) {
    y = sectionTitle(doc, "DISPATCHER PAYROLL", y) + 6;
    const headers = [
      "Dispatcher",
      "Gross",
      "Base",
      "Commission",
      "Tracking",
      "Fuel",
      "Deductions",
      "Advance",
      "Tax",
      "Net pay",
    ];
    const colWidths = [30, 15, 15, 18, 18, 14, 16, 14, 14, 18];
    const rows = dispatcherRows.map((row) => [
      row.dispatcherName,
      money(row.grossUsd, "USD"),
      money(row.baseSalary, "PKR"),
      money(row.commissionUsd, "USD"),
      money(row.trackingFee, "PKR"),
      money(row.fuelAllowance, "PKR"),
      money(row.deductions, "PKR"),
      money(row.advance, "PKR"),
      money(row.tax, "PKR"),
      money(row.netPay, "PKR"),
    ]);
    y = dataTable(doc, { x: MARGIN, y, colWidths, headers, rows });
  }

  if (employeeRows.length > 0) {
    y += 10;
    if (y > PAGE_H - MARGIN - 40) {
      doc.addPage();
      y = MARGIN + 10;
    }
    y = sectionTitle(doc, "FIXED-SALARY EMPLOYEES", y) + 6;
    const headers = [
      "Employee",
      "Base Salary",
      "Deductions",
      "Advance",
      "Tax",
      "Net Pay",
    ];
    const colWidths = [40, 28, 27, 27, 27, 29];
    const rows = employeeRows.map((row) => [
      row.dispatcherName,
      money(row.baseSalary, "PKR"),
      money(row.deductions, "PKR"),
      money(row.advance, "PKR"),
      money(row.tax, "PKR"),
      money(row.netPay, "PKR"),
    ]);
    y = dataTable(doc, { x: MARGIN, y, colWidths, headers, rows });
  }

  const breakdownRows = report.monthlyBreakdown;

  if (report.periodType === "Yearly" && breakdownRows?.length > 0) {
    y += 12;
    if (y > PAGE_H - MARGIN - 40) {
      doc.addPage();
      y = MARGIN + 10;
    }
    y = sectionTitle(doc, "MONTHLY BREAKDOWN", y) + 6;

    // Yearly reports include a monthly breakdown with per-month tax and profit.
    const bdHeaders = [
      "Period",
      "Gross",
      "Tracking",
      "Net payroll",
      "Expenses",
      "Deductions",
      "Tax",
      "Profit",
    ];
    const bdColWidths = [24, 22, 22, 22, 22, 22, 22, 22];
    const bdRows = breakdownRows.map((row) => {
      const periodLabel = row.shortLabel;
      if (!row.reached) {
        return [periodLabel, ...Array(7).fill("\u2014")];
      }
      return [
        periodLabel,
        money(row.grossUsd, "USD"),
        money(row.trackingFees, "PKR"),
        money(row.payroll, "PKR"),
        money(row.expenses, "PKR"),
        money(row.deductions, "PKR"),
        money(row.tax, "PKR"),
        money(row.profit, "PKR"),
      ];
    });
    y = dataTable(doc, {
      x: MARGIN,
      y,
      colWidths: bdColWidths,
      headers: bdHeaders,
      rows: bdRows,
    });
  }

  if (report.expenseCategories) {
    y += 12;
    if (y > PAGE_H - MARGIN - 35) {
      doc.addPage();
      y = MARGIN + 10;
    }
    y =
      sectionTitle(
        doc,
        report.periodType === "Monthly"
          ? `EXPENSES - ${report.label.toUpperCase()}`
          : `EXPENSE TOTALS - ${report.label}`,
        y,
      ) + 6;
    const categoryRows = Object.entries(report.expenseCategories).map(
      ([category, amount]) => [
        EXPENSE_CATEGORIES[category]?.label ?? category,
        money(amount, "PKR"),
      ],
    );
    categoryRows.push(["Total Expenses", money(report.expenses, "PKR")]);
    y = dataTable(doc, {
      x: MARGIN,
      y,
      colWidths: [130, 48],
      headers: ["Category", "Amount"],
      rows: categoryRows,
    });
  }

  y += 14;
  if (y > PAGE_H - MARGIN - 14) {
    doc.addPage();
    y = MARGIN + 10;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `System-generated report \u2014 created ${new Date().toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    )}.`,
    PAGE_W / 2,
    y,
    { align: "center" },
  );

  return doc;
}

export async function downloadReportPdf(report, opts) {
  const doc = await generateReportPdf(report, opts);
  const safeLabel = report.label.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`nexxus_${report.periodType.toLowerCase()}_report_${safeLabel}.pdf`);
}
