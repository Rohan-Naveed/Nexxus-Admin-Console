const { dbQuery, dbExecute } = require("../../db/helpers");
const queries = require("../../../config/db.json").dispatchers;
const { ApiError } = require("../../middleware/errorHandler");

// DB rows are snake_case; the API (and the frontend) speak camelCase.
// This is the one place that translation happens for this module.
function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    employeeType: row.employee_type || "dispatcher",
    alias: row.dispatch_alias,
    percentage: Number(row.commission_percentage),
    basicSalaryMonthly: Number(row.basic_salary_monthly),
    fuelAllowanceMonthly: Number(row.fuel_allowance_monthly),
    defaultCashAmount: Number(row.default_cash_amount),
    googleSheetId: row.google_sheet_id || "",
    googleSheetTab: row.google_sheet_tab || "",
    profile: {
      email: row.email || "",
      phone: row.phone || "",
      address: row.address || "",
      dob: row.dob,
      gender: row.gender || "",
      designation: row.designation,
      cnic: row.cnic || "",
      accountNumber: row.account_number || "",
      status: row.status,
      joinedDate: row.joined_date,
      leftDate: row.left_date,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchAll() {
  const rows = await dbQuery(queries.selectAll, [], "dispatchers.selectAll");
  return rows.map(toApiShape);
}

async function fetchById(id) {
  const rows = await dbQuery(
    queries.selectById,
    [id],
    "dispatchers.selectById",
  );
  return toApiShape(rows[0]);
}

async function fetchUnlinkedSheets() {
  const rows = await dbQuery(
    queries.selectUnlinkedSheets,
    [],
    "dispatchers.selectUnlinkedSheets",
  );
  return rows.map(toApiShape);
}

// `actor` is the authenticated user's email, supplied by the controller from
// req.user — never from the request body — and recorded as created_by/updated_by.
async function create(input, actor) {
  const employeeType =
    input.employeeType === "employee" ? "employee" : "dispatcher";
  if (!input.name?.trim()) {
    throw new ApiError(400, "Employee name is required.");
  }
  if (employeeType === "dispatcher" && !input.alias?.trim()) {
    throw new ApiError(400, "Dispatching alias is required for dispatchers.");
  }

  const params = [
    slugify(input.name),
    input.name.trim(),
    input.alias?.trim() || input.name.trim(),
    employeeType === "dispatcher" ? (input.percentage ?? 0) : 0,
    input.basicSalaryMonthly ?? 0,
    employeeType === "dispatcher" ? (input.fuelAllowanceMonthly ?? 0) : 0,
    input.defaultCashAmount ?? 0,
    input.profile?.email ?? null,
    input.profile?.phone ?? null,
    input.profile?.address ?? null,
    input.profile?.dob ?? null,
    input.profile?.gender ?? null,
    input.profile?.designation ??
      (employeeType === "dispatcher" ? "Dispatcher" : "Employee"),
    input.profile?.cnic ?? null,
    input.profile?.accountNumber ?? null,
    input.profile?.status ?? "active",
    input.profile?.joinedDate ?? null,
    input.profile?.leftDate ?? null,
    employeeType === "dispatcher" ? (input.googleSheetId ?? null) : null,
    employeeType === "dispatcher" ? (input.googleSheetTab ?? null) : null,
    actor ?? null,
    employeeType,
  ];

  const rows = await dbQuery(queries.insert, params, "dispatchers.insert");
  return toApiShape(rows[0]);
}

async function update(id, input, actor) {
  const existing = await fetchById(id);
  if (!existing) {
    throw new ApiError(404, `Dispatcher ${id} not found.`);
  }

  const params = [
    id,
    input.name ?? existing.name,
    input.alias ?? existing.alias ?? existing.name,
    existing.employeeType === "employee"
      ? 0
      : (input.percentage ?? existing.percentage),
    input.basicSalaryMonthly ?? existing.basicSalaryMonthly,
    existing.employeeType === "employee"
      ? 0
      : (input.fuelAllowanceMonthly ?? existing.fuelAllowanceMonthly),
    input.defaultCashAmount ?? existing.defaultCashAmount,
    input.profile?.email ?? existing.profile.email,
    input.profile?.phone ?? existing.profile.phone,
    input.profile?.address ?? existing.profile.address,
    input.profile?.dob ?? existing.profile.dob,
    input.profile?.gender ?? existing.profile.gender,
    input.profile?.designation ?? existing.profile.designation,
    input.profile?.cnic ?? existing.profile.cnic,
    input.profile?.accountNumber ?? existing.profile.accountNumber,
    input.profile?.status ?? existing.profile.status,
    input.profile?.joinedDate ?? existing.profile.joinedDate,
    input.profile?.leftDate ?? existing.profile.leftDate,
    existing.employeeType === "employee"
      ? null
      : (input.googleSheetId ?? existing.googleSheetId),
    existing.employeeType === "employee"
      ? null
      : (input.googleSheetTab ?? existing.googleSheetTab),
    existing.employeeType,
    actor ?? null,
  ];

  const rowCount = await dbExecute(
    queries.update,
    params,
    "dispatchers.update",
  );
  if (rowCount === 0) {
    throw new ApiError(404, `Dispatcher ${id} not found.`);
  }
  return fetchById(id);
}

async function remove(id) {
  const rowCount = await dbExecute(queries.delete, [id], "dispatchers.delete");
  if (rowCount === 0) {
    throw new ApiError(404, `Dispatcher ${id} not found.`);
  }
  return { id, deleted: true };
}

module.exports = {
  fetchAll,
  fetchById,
  fetchUnlinkedSheets,
  create,
  update,
  remove,
  toApiShape,
};
