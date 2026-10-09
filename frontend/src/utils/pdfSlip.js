// Renders a salary slip to PDF using jsPDF, matching the layout of the
// Nexxus Logistics payroll statement template: logo + company header,
// employee info table, Earnings/Deductions summary, Basic Salary/Fuel
// Allowance vs Cash/Account boxes, and a Net Pay banner.
//
// Takes a flat `slip` object — the shape returned by
// src/utils/slipCalc.js#computeSlipPreview, plus a few identity fields
// (dispatcherName, designation, cnic, accountNumber, email) snapshotted
// at generation time so a slip's PDF stays accurate even if the
// dispatcher's profile changes later.
import { jsPDF } from "jspdf";
import logoSrc from "../assets/logo.jpeg";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ROUTE_COLOR = [31, 111, 92]; // matches --route
const BRICK_COLOR = [166, 66, 59]; // matches --brick
const INK_COLOR = [24, 28, 32];

function pkr(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function usd(n) {
  const v = Number(n) || 0;
  return (
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

// Draws a bordered label:value table starting at (x, y) and returns the y
// position just after the last row.
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
    doc.setFontSize(9);
    doc.setTextColor(...(row.labelColor ?? INK_COLOR));
    doc.text(row.label, x + 2.2, ry + rowH / 2 + 1.1);

    doc.setFont("helvetica", row.valueBold ? "bold" : "normal");
    doc.setTextColor(...(row.valueColor ?? INK_COLOR));
    doc.text(String(row.value), x + lw + 2.2, ry + rowH / 2 + 1.1);
  });

  doc.setTextColor(...INK_COLOR);
  return y + rows.length * rowH;
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

export async function generateSlipPdf(slip) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isDispatcher = slip.employeeType !== "employee";

  // Outer border, mirroring the template's framed page.
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
    // Logo failed to load (e.g. offline) — slip still generates without it.
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

  y = sectionTitle(doc, "PAYROLL STATEMENT", y) + 8;

  // Employee info table
  const empTableW = 132;
  const empX = (PAGE_W - empTableW) / 2;
  y = keyValueTable(doc, {
    x: empX,
    y,
    width: empTableW,
    labelWidth: empTableW * 0.4,
    rows: [
      { label: "Employe Name :", value: slip.dispatcherName },
      ...(isDispatcher
        ? [
            {
              label: "Dispatch Alias :",
              value: slip.dispatchAlias || slip.dispatcherName,
            },
          ]
        : []),
      {
        label: "Designation",
        value: slip.designation || (isDispatcher ? "Dispatcher" : "Employee"),
      },
      { label: "Account Number:", value: slip.accountNumber || "\u2014" },
      { label: "CNIC :", value: slip.cnic || "\u2014" },
      { label: "Salary Period", value: slip.periodLabel },
      { label: "Email", value: slip.email || "\u2014" },
    ],
  });

  y += 8;
  y = sectionTitle(doc, "SALARY SUMMARY", y) + 6;

  const colGap = 8;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_COLOR);
  doc.text("EARNINGS :", leftX + colW / 2, y, { align: "center" });
  doc.text("DEDUCATIONS", rightX + colW / 2, y, { align: "center" });
  const tableTopY = y + 3;

  const commissionLabel = `${slip.commissionPercent % 1 === 0 ? slip.commissionPercent.toFixed(0) : slip.commissionPercent.toFixed(1)}% Comisson USD:`;
  const deductionRows = Array.isArray(slip.deductionsBreakdown)
    ? slip.deductionsBreakdown.map((item) => ({
        label: `${item.label}:`,
        value: pkr(item.amount),
      }))
    : [
        { label: "Late / Fine :", value: pkr(slip.lateFine) },
        { label: "Violation / Fine :", value: pkr(slip.violationFine) },
      ];

  const earningsEndY = keyValueTable(doc, {
    x: leftX,
    y: tableTopY,
    width: colW,
    rows: isDispatcher
      ? [
          { label: "USD Rate", value: `pkr${slip.usdRate.toFixed(2)}` },
          { label: "Monthly Gross MMH", value: usd(slip.monthlyGrossUsd) },
          { label: commissionLabel, value: usd(slip.commissionUsd) },
          {
            label: "Amount in PKR",
            value: pkr(slip.amountInPkr),
            labelColor: ROUTE_COLOR,
            valueColor: ROUTE_COLOR,
          },
        ]
      : [
          {
            label: "Base Salary",
            value: pkr(slip.basicSalary),
            labelColor: ROUTE_COLOR,
            valueColor: ROUTE_COLOR,
          },
        ],
  });

  const deductionsEndY = keyValueTable(doc, {
    x: rightX,
    y: tableTopY,
    width: colW,
    rows: [
      ...deductionRows,
      { label: "Advance", value: pkr(slip.advance) },
      { label: "Income Tax :", value: pkr(slip.incomeTax) },
      {
        label: "TOTAL",
        value: pkr(slip.totalDeductions),
        valueBold: true,
        labelColor: BRICK_COLOR,
        valueColor: BRICK_COLOR,
      },
    ],
  });

  y = Math.max(earningsEndY, deductionsEndY) + 10;

  const basicEndY = keyValueTable(doc, {
    x: leftX,
    y,
    width: colW,
    rows: isDispatcher
      ? [
          {
            label: "Base Salary",
            value: pkr(slip.basicSalary),
            labelColor: ROUTE_COLOR,
            valueColor: ROUTE_COLOR,
          },
          {
            label: "FUEL Allowance",
            value: pkr(slip.fuelAllowance),
            labelColor: ROUTE_COLOR,
            valueColor: ROUTE_COLOR,
          },
          { label: "TOTAL", value: pkr(slip.totalEarnings), valueBold: true },
        ]
      : [{ label: "TOTAL", value: pkr(slip.totalEarnings), valueBold: true }],
  });

  const cashEndY = keyValueTable(doc, {
    x: rightX,
    y,
    width: colW,
    rows: [
      { label: "Cash", value: pkr(slip.cashAmount) },
      { label: "Account", value: pkr(slip.accountAmount) },
    ],
  });

  y = Math.max(basicEndY, cashEndY) + 10;

  // NET PAY banner
  doc.setFillColor(226, 226, 220);
  doc.setDrawColor(20);
  doc.rect(MARGIN, y, CONTENT_W, 13, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK_COLOR);
  doc.text(`NET PAY: ${pkr(slip.netPay)}`, PAGE_W / 2, y + 8.5, {
    align: "center",
  });

  y += 26;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "This is a system-generated slip and does not require any signature or stamp.",
    PAGE_W / 2,
    y,
    { align: "center" },
  );

  return doc;
}

export async function downloadSlipPdf(slip) {
  const doc = await generateSlipPdf(slip);
  const safeName = (slip.dispatcherName || "dispatcher").replace(
    /[^a-z0-9]+/gi,
    "_",
  );
  doc.save(`${safeName}_${slip.monthKey}_salary_slip.pdf`);
}
