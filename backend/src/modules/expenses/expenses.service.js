const { dbQuery, dbExecute } = require("../../db/helpers");
const db = require("../../../config/db.json");
const { ApiError } = require("../../middleware/errorHandler");
const wc = require("../../utils/weekCalendar");

const queries = db.expenses;
const categoryQueries = db.expenseCategories;

function validateMonth(monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || "")) {
    throw new ApiError(400, "month is required in YYYY-MM format.");
  }
  if (monthKey > wc.todayInTimezone().slice(0, 7)) {
    throw new ApiError(400, "Expenses cannot be recorded for a future month.");
  }
  return `${monthKey}-01`;
}

function toApiShape(row) {
  if (!row) return null;
  const monthKey = String(row.expense_month).slice(0, 7);
  return {
    id: row.id,
    category: row.category_key,
    categoryLabel: row.category_label || row.category_key,
    amount: Number(row.amount),
    monthKey,
    date: `${monthKey}-01`,
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function toCategoryApiShape(row) {
  return {
    key: row.key,
    label: row.label,
    active: row.is_active,
    usageCount: Number(row.usage_count ?? 0),
  };
}

async function fetchAllCategories(activeOnly = false) {
  const rows = await dbQuery(
    activeOnly ? categoryQueries.selectActive : categoryQueries.selectAll,
    [],
    "expenseCategories.selectAll",
  );
  return rows.map(toCategoryApiShape);
}

function categoryKey(label) {
  const key = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!key) throw new ApiError(400, "A category name is required.");
  return key;
}

async function createCategory(input) {
  const label = String(input.label || "").trim();
  if (!label) throw new ApiError(400, "A category name is required.");
  if (label.length > 80) throw new ApiError(400, "Category names must be 80 characters or fewer.");
  try {
    const rows = await dbQuery(
      categoryQueries.insert,
      [categoryKey(label), label],
      "expenseCategories.insert",
    );
    return toCategoryApiShape(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "An expense category with this name already exists.");
    }
    throw err;
  }
}

async function updateCategory(key, input) {
  const found = await dbQuery(categoryQueries.selectByKey, [key], "expenseCategories.selectByKey");
  if (!found[0]) throw new ApiError(404, `Expense category ${key} not found.`);
  const label = input.label === undefined ? found[0].label : String(input.label).trim();
  if (!label) throw new ApiError(400, "A category name is required.");
  if (label.length > 80) throw new ApiError(400, "Category names must be 80 characters or fewer.");
  const active = input.active === undefined ? found[0].is_active : Boolean(input.active);
  const rows = await dbQuery(categoryQueries.update, [key, label, active], "expenseCategories.update");
  return toCategoryApiShape(rows[0]);
}

async function archiveCategory(key) {
  return updateCategory(key, { active: false });
}

async function deleteCategory(key) {
  const found = await dbQuery(categoryQueries.selectByKey, [key], "expenseCategories.selectByKey");
  if (!found[0]) throw new ApiError(404, `Expense category ${key} not found.`);
  const usage = await dbQuery(categoryQueries.usageCount, [key], "expenseCategories.usageCount");
  if (Number(usage[0]?.count ?? 0) > 0) {
    throw new ApiError(409, "This expense category has linked records. Archive it to preserve history.");
  }
  try {
    const rowCount = await dbExecute(categoryQueries.delete, [key], "expenseCategories.delete");
    if (rowCount === 0) throw new ApiError(404, `Expense category ${key} not found.`);
  } catch (err) {
    if (err.code === "23503") {
      throw new ApiError(409, "This expense category has linked records. Archive it to preserve history.");
    }
    throw err;
  }
  return { key, deleted: true };
}

async function fetchAll() {
  const rows = await dbQuery(queries.selectAll, [], "expenses.selectAll");
  return rows.map(toApiShape);
}

async function fetchByDateRange(from, to) {
  validateMonth(from);
  validateMonth(to);
  const rows = await dbQuery(
    queries.selectByDateRange,
    [`${from}-01`, `${to}-01`],
    "expenses.selectByDateRange",
  );
  return rows.map(toApiShape);
}

// `actor` = authenticated user's email from req.user (never the request body).
async function create(input, actor) {
  if (!input.category?.trim()) {
    throw new ApiError(400, "category is required.");
  }
  if (input.amount === undefined || input.amount === null || input.amount === "" || !Number.isFinite(Number(input.amount))) {
    throw new ApiError(400, "amount is required.");
  }
  const month = validateMonth(input.monthKey ?? input.month);
  if (Number(input.amount) < 0) throw new ApiError(400, "amount cannot be negative.");
  const categoryRows = await dbQuery(categoryQueries.selectByKey, [input.category], "expenseCategories.selectByKey");
  if (!categoryRows[0]?.is_active) throw new ApiError(400, "Choose an active expense category.");
  const existing = await dbQuery(queries.selectByMonthCategory, [month, input.category], "expenses.selectByMonthCategory");
  if (existing.length) throw new ApiError(409, "An amount is already recorded for this category and month. Edit the existing entry instead.");

  try {
    const rows = await dbQuery(
      queries.insert,
      [input.category, input.amount, month, input.note || null, actor ?? null],
      "expenses.insert",
    );
    return toApiShape(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "An amount is already recorded for this category and month.");
    }
    throw err;
  }
}

async function update(id, patch, actor) {
  const existingRows = await dbQuery(
    queries.selectById,
    [id],
    "expenses.selectById",
  );
  const existing = toApiShape(existingRows[0]);
  if (!existing) {
    throw new ApiError(404, `Expense ${id} not found.`);
  }

  const category = patch.category ?? existing.category;
  const monthKey = patch.monthKey ?? patch.month ?? existing.monthKey;
  const month = validateMonth(monthKey);
  if (patch.amount !== undefined && (patch.amount === "" || !Number.isFinite(Number(patch.amount)) || Number(patch.amount) < 0)) {
    throw new ApiError(400, "amount cannot be negative.");
  }
  const categoryRows = await dbQuery(categoryQueries.selectByKey, [category], "expenseCategories.selectByKey");
  if (!categoryRows[0] || (!categoryRows[0].is_active && category !== existing.category)) {
    throw new ApiError(400, "Choose an active expense category.");
  }
  const duplicates = await dbQuery(queries.selectByMonthCategory, [month, category], "expenses.selectByMonthCategory");
  if (duplicates.some((row) => String(row.id) !== String(id))) {
    throw new ApiError(409, "An amount is already recorded for this category and month.");
  }

  const rows = await dbQuery(
    queries.updateReturning,
    [
      id,
      category,
      patch.amount === undefined ? existing.amount : patch.amount,
      month,
      patch.note === undefined ? existing.note : patch.note || null,
      actor ?? null,
    ],
    "expenses.updateReturning",
  );
  return toApiShape(rows[0]);
}

async function remove(id) {
  const rowCount = await dbExecute(queries.delete, [id], "expenses.delete");
  if (rowCount === 0) {
    throw new ApiError(404, `Expense ${id} not found.`);
  }
  return { id, deleted: true };
}

module.exports = {
  fetchAllCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  deleteCategory,
  fetchAll,
  fetchByDateRange,
  create,
  update,
  remove,
};
