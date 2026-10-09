const { dbQuery, dbExecute } = require("../../db/helpers");
const queries = require("../../../config/db.json").salarySlips;
const { ApiError } = require("../../middleware/errorHandler");
const { sendSalarySlipEmail } = require("./salarySlipMailer");

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    dispatcherId: row.dispatcher_id,
    employeeType: row.employee_type || "dispatcher",
    periodYear: row.period_year,
    periodMonth: row.period_month,
    dispatcherName: row.dispatcher_name,
    dispatchAlias: row.dispatch_alias,
    designation: row.designation,
    cnic: row.cnic,
    accountNumber: row.account_number,
    email: row.email,
    usdPerPkr: Number(row.usd_per_pkr),
    taxPercent: Number(row.tax_percent),
    monthlyGrossUsd: Number(row.monthly_gross_usd),
    commissionPercent: Number(row.commission_percent),
    commissionUsd: Number(row.commission_usd),
    amountInPkr: Number(row.amount_in_pkr),
    basicSalary: Number(row.basic_salary),
    fuelAllowance: Number(row.fuel_allowance),
    totalEarnings: Number(row.total_earnings),
    lateFine: Number(row.late_fine),
    violationFine: Number(row.violation_fine),
    deductionsBreakdown: row.deductions_breakdown || [],
    advance: Number(row.advance),
    incomeTax: Number(row.income_tax),
    totalDeductions: Number(row.total_deductions),
    netPay: Number(row.net_pay),
    cashAmount: Number(row.cash_amount),
    accountAmount: Number(row.account_amount),
    emailStatus: row.email_status || "not_sent",
    emailSentAt: row.email_sent_at,
    emailSentTo: row.email_sent_to,
    emailSentBy: row.email_sent_by,
    emailLastAttemptAt: row.email_last_attempt_at,
    emailLastError: row.email_last_error,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
  };
}

function toApiHistoryShape(row) {
  return {
    id: row.id,
    salarySlipId: row.salary_slip_id,
    dispatcherId: row.dispatcher_id,
    dispatcherName: row.dispatcher_name,
    dispatchAlias: row.dispatch_alias,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    eventType: row.event_type,
    eventAt: row.event_at,
    actor: row.actor,
    email: row.email,
  };
}

const REQUIRED_FIELDS = [
  "dispatcherId",
  "periodYear",
  "periodMonth",
  "dispatcherName",
  "dispatchAlias",
  "usdPerPkr",
  "taxPercent",
  "monthlyGrossUsd",
  "commissionPercent",
  "commissionUsd",
  "amountInPkr",
  "basicSalary",
  "fuelAllowance",
  "totalEarnings",
  "incomeTax",
  "totalDeductions",
  "netPay",
  "accountAmount",
];

async function fetchAll() {
  const rows = await dbQuery(queries.selectAll, [], "salarySlips.selectAll");
  return rows.map(toApiShape);
}

async function fetchHistory() {
  const rows = await dbQuery(
    queries.selectHistory,
    [],
    "salarySlips.selectHistory",
  );
  return rows.map(toApiHistoryShape);
}

async function fetchForDispatcher(dispatcherId) {
  const rows = await dbQuery(
    queries.selectByDispatcher,
    [dispatcherId],
    "salarySlips.selectByDispatcher",
  );
  return rows.map(toApiShape);
}

async function fetchOne(dispatcherId, year, month) {
  const rows = await dbQuery(
    queries.selectOne,
    [dispatcherId, year, month],
    "salarySlips.selectOne",
  );
  return toApiShape(rows[0]);
}

// Generating again for the same dispatcher/month overwrites the existing
// row — a deliberate "regenerate", not a duplicate. Backed by the
// UNIQUE(dispatcher_id, period_year, period_month) constraint via
// ON CONFLICT ... DO UPDATE.
// `actor` = authenticated user's email from req.user; recorded as generated_by
// (overwritten on regenerate, alongside generated_at).
async function generate(slip, actor) {
  const missing = REQUIRED_FIELDS.filter(
    (field) => slip[field] === undefined || slip[field] === null,
  );
  if (missing.length > 0) {
    throw new ApiError(
      400,
      `Missing required slip field(s): ${missing.join(", ")}`,
    );
  }

  const params = [
    slip.dispatcherId,
    slip.periodYear,
    slip.periodMonth,
    slip.dispatcherName,
    slip.dispatchAlias,
    slip.designation ||
      (slip.employeeType === "employee" ? "Employee" : "Dispatcher"),
    slip.cnic || null,
    slip.accountNumber || null,
    slip.email || null,
    slip.usdPerPkr,
    slip.taxPercent,
    slip.monthlyGrossUsd,
    slip.commissionPercent,
    slip.commissionUsd,
    slip.amountInPkr,
    slip.basicSalary,
    slip.fuelAllowance,
    slip.totalEarnings,
    slip.lateFine ?? 0,
    slip.violationFine ?? 0,
    slip.advance ?? 0,
    slip.incomeTax,
    slip.totalDeductions,
    slip.netPay,
    slip.cashAmount ?? 0,
    slip.accountAmount,
    actor ?? null,
    slip.employeeType === "employee" ? "employee" : "dispatcher",
    JSON.stringify(
      Array.isArray(slip.deductionsBreakdown)
        ? slip.deductionsBreakdown
        : [
            ...(Number(slip.lateFine) > 0
              ? [{ key: "late", label: "Late", amount: Number(slip.lateFine) }]
              : []),
            ...(Number(slip.violationFine) > 0
              ? [
                  {
                    key: "violation",
                    label: "Violation / other",
                    amount: Number(slip.violationFine),
                  },
                ]
              : []),
          ],
    ),
  ];

  const rows = await dbQuery(queries.upsert, params, "salarySlips.upsert");
  const resetRows = await dbQuery(
    queries.resetEmailStatus,
    [rows[0].id],
    "salarySlips.resetEmailStatus",
  );
  const generated = resetRows[0];
  await dbQuery(
    queries.insertGeneratedHistory,
    [
      generated.id,
      generated.dispatcher_id,
      generated.dispatcher_name,
      generated.dispatch_alias,
      generated.period_year,
      generated.period_month,
      actor ?? null,
    ],
    "salarySlips.insertGeneratedHistory",
  );
  return toApiShape(generated);
}

async function sendSlipEmail(id, pdfBase64, actor) {
  const slipRows = await dbQuery(
    queries.selectForEmail,
    [id],
    "salarySlips.selectForEmail",
  );
  const slip = slipRows[0];
  if (!slip) throw new ApiError(404, `Salary slip ${id} not found.`);

  const recipient = String(slip.current_employee_email || "").trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new ApiError(
      400,
      "Add a valid email address to this employee's profile before sending the salary slip.",
    );
  }
  if (
    typeof pdfBase64 !== "string" ||
    pdfBase64.length === 0 ||
    pdfBase64.length > 12 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)
  ) {
    throw new ApiError(400, "A valid salary-slip PDF attachment is required.");
  }
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  if (
    pdfBuffer.length === 0 ||
    pdfBuffer.subarray(0, 5).toString() !== "%PDF-"
  ) {
    throw new ApiError(400, "The attachment is not a valid PDF file.");
  }

  const sendingRows = await dbQuery(
    queries.markEmailSending,
    [id],
    "salarySlips.markEmailSending",
  );
  if (sendingRows.length === 0) {
    throw new ApiError(409, "This salary slip is already being emailed.");
  }

  const periodLabel = `${MONTH_NAMES[slip.period_month - 1]} ${slip.period_year}`;
  const safeName = String(slip.dispatch_alias || slip.dispatcher_name)
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_");
  const filename = `salary_slip_${safeName}_${slip.period_year}-${String(slip.period_month).padStart(2, "0")}.pdf`;

  try {
    await sendSalarySlipEmail({
      to: recipient,
      dispatcherName: slip.dispatcher_name,
      periodLabel,
      pdfBuffer,
      filename,
    });
  } catch (error) {
    await dbQuery(
      queries.markEmailFailed,
      [id, String(error.message || "Email delivery failed.").slice(0, 1000)],
      "salarySlips.markEmailFailed",
    );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "Could not send the salary slip email. Check the SMTP configuration and try again.",
    );
  }

  const sentRows = await dbQuery(
    queries.markEmailSent,
    [id, recipient, actor ?? null],
    "salarySlips.markEmailSent",
  );
  const sent = sentRows[0];
  await dbQuery(
    queries.insertEmailSentHistory,
    [
      sent.id,
      sent.dispatcher_id,
      sent.dispatcher_name,
      sent.dispatch_alias,
      sent.period_year,
      sent.period_month,
      actor ?? null,
      recipient,
    ],
    "salarySlips.insertEmailSentHistory",
  );
  return toApiShape(sent);
}

async function remove(id) {
  const rowCount = await dbExecute(queries.delete, [id], "salarySlips.delete");
  if (rowCount === 0) {
    throw new ApiError(404, `Salary slip ${id} not found.`);
  }
  return { id, deleted: true };
}

module.exports = {
  fetchAll,
  fetchHistory,
  fetchForDispatcher,
  fetchOne,
  generate,
  sendSlipEmail,
  remove,
};
