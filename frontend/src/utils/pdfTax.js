// Renders a Monthly/Yearly Tax-tab report to PDF using jsPDF — the same
// company-branded header/frame as src/utils/pdfReport.js and
// src/utils/pdfSlip.js, followed by a summary block and a per-dispatcher
// breakdown table. Takes the report object shape returned by
// src/utils/taxCalc.js.
import { jsPDF } from "jspdf";
import logoSrc from "../assets/logo.jpeg";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ROUTE_COLOR = [31, 111, 92]; // matches --route
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

function toDisplay(amountPkr, currency, usdPerPkr) {
  if (currency !== "USD") return amountPkr;
  if (!(usdPerPkr > 0)) throw new Error("USD exchange rate is unavailable.");
  return amountPkr * usdPerPkr;
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

function dataTable(doc, { x, y, colWidths, headers, rows }) {
  const rowH = 7.5;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  function drawHeader(atY) {
    doc.setFillColor(...ROUTE_COLOR);
    doc.rect(x, atY, tableW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    let cx = x;
    headers.forEach((h, i) => {
      const align = i === 0 ? "left" : "right";
      const tx = i === 0 ? cx + 2.2 : cx + colWidths[i] - 2.2;
      doc.text(h, tx, atY + rowH / 2 + 1.1, { align });
      cx += colWidths[i];
    });
    doc.setTextColor(...INK_COLOR);
    return atY + rowH;
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

export async function generateTaxPdf(
  report,
  { currency = "PKR", usdPerPkr = null } = {},
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setDrawColor(20);
  doc.setLineWidth(0.6);
  doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, PAGE_H - (MARGIN - 5) * 2);

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
      ? `MONTHLY TAX REPORT \u2014 ${report.label.toUpperCase()}`
      : `YEARLY TAX REPORT \u2014 ${report.label}`;
  const taxRateLabel = report.taxRateLabel ?? `${report.taxPercent}%`;
  y = sectionTitle(doc, title, y);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Figures shown in ${currency} \u00b7 tax rate ${taxRateLabel}`,
    PAGE_W / 2,
    y + 5,
    { align: "center" },
  );
  doc.setTextColor(...INK_COLOR);
  y += 12;

  if (report.periodType === "Yearly" && report.hasDetail === false) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 90, 40);
    doc.text(
      "Note: detailed tax history is not available for this year.",
      PAGE_W / 2,
      y,
      {
        align: "center",
      },
    );
    doc.setTextColor(...INK_COLOR);
    y += 8;
  }

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
        label: "Total Taxable Pay",
        value: money(
          toDisplay(report.taxableTotal, currency, usdPerPkr),
          currency,
        ),
        labelColor: ROUTE_COLOR,
        valueColor: ROUTE_COLOR,
      },
      {
        label: `Total Estimated Tax (${taxRateLabel})`,
        value: money(toDisplay(report.taxTotal, currency, usdPerPkr), currency),
        valueBold: true,
      },
    ],
  });

  y += 10;
  y = sectionTitle(doc, "DISPATCHER BREAKDOWN", y) + 6;

  const headers = [
    "Dispatcher",
    "Base Salary",
    "Commission",
    "Fuel Allow.",
    "Taxable Pay",
    "Est. Tax",
  ];
  const colWidths = [46, 28, 28, 26, 26, 24];
  const rows = report.rows.map((row) => [
    row.dispatcherName,
    money(toDisplay(row.baseSalary, currency, usdPerPkr), currency),
    money(toDisplay(row.commission, currency, usdPerPkr), currency),
    money(toDisplay(row.fuelAllowance, currency, usdPerPkr), currency),
    money(toDisplay(row.taxableBase, currency, usdPerPkr), currency),
    money(toDisplay(row.tax, currency, usdPerPkr), currency),
  ]);

  y = dataTable(doc, { x: MARGIN, y, colWidths, headers, rows });

  if (report.periodType === "Yearly" && report.monthlyBreakdown?.length > 0) {
    y += 12;
    if (y > PAGE_H - MARGIN - 40) {
      doc.addPage();
      y = MARGIN + 10;
    }
    y = sectionTitle(doc, "MONTHLY BREAKDOWN", y) + 6;

    const bdHeaders = ["Month", "Taxable Pay", "Est. Tax"];
    const bdColWidths = [59.6, 59.6, 59.6];
    const bdRows = report.monthlyBreakdown.map((row) => {
      if (!row.reached) return [row.shortLabel, "\u2014", "\u2014"];
      return [
        row.shortLabel,
        money(toDisplay(row.taxableTotal, currency, usdPerPkr), currency),
        money(toDisplay(row.taxTotal, currency, usdPerPkr), currency),
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

export async function downloadTaxPdf(report, opts) {
  const doc = await generateTaxPdf(report, opts);
  const safeLabel = report.label.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`nexxus_${report.periodType.toLowerCase()}_tax_${safeLabel}.pdf`);
}
