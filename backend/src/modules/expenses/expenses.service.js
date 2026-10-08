const { dbQuery, dbExecute } = require("../../db/helpers");
const db = require("../../../config/db.json");
const { ApiError } = require("../../middleware/errorHandler");
const calendarService = require("../calendar/calendar.service");
const wc = require("../../utils/weekCalendar");

const queries = db.expenses;
const categoryQueries = db.expenseCategories;

// Entered ONCE per month by the admin (not per day/week). They belong to a
// period month (the month a week is labelled with in the Week Calendar) and
// are stored with expense_date = the end date of that month's last week, so
// they always fall inside the month. Miscellaneous stays a dated entry.
const MONTHLY_CATEGORIES = ["dinner", "electricity", "gas", "water"];
const MONTHLY_LABELS = {
  dinner: "Dinner",
  electricity: "Electricity bill",
  gas: "Gas bill",
  water: "Water bill",
};
const isMonthly = (key) => MONTHLY_CATEGORIES.includes(key);

// Validates "YYYY-MM", makes sure its weeks are set and the month has
// started, and returns its date span. `date` is what monthly entries get.
async function resolveMonth(monthKey, now = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || "")) {
    throw new ApiError(400, "month is required in YYYY-MM format.");
  }
  const { year, month } = wc.parseMonthKey(monthKey);
  const label = calendarService.monthLabel(year, month);
  const weeks = await calendarService.getWeeksOfMonth(year, month);
  if (!weeks.length) {
    throw new ApiError(
      400,
      `No weeks are set for ${label}. Set them in the Week Calendar before recording its expenses.`,
    );
  }
  const start = weeks.reduce((min, w) => (w.start < min ? w.start : min), weeks[0].start);
  const end = weeks.reduce((max, w) => (w.end > max ? w.end : max), weeks[0].end);
  if (start > wc.todayInTimezone(now)) {
    throw new ApiError(400, `${label} has not started yet.`);
  }
  return { year, month, label, start, end, date: end };
}

async function entriesInSpan(span, category) {
  const rows = await dbQuery(
    queries.selectByDateRange,
    [span.start, span.end],
    "expenses.selectByDateRange",
  );
  return rows.map(toApiShape).filter((e) => e.category === category);
}

function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category_key,
    amount: Number(row.amount),
    date: row.expense_date,
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function toCategoryApiShape(row) {
  return { key: row.key, label: row.label, cadence: row.cadence };
}

async function fetchAllCategories() {
  const rows = await dbQuery(
    categoryQueries.selectAll,
    [],
    "expenseCategories.selectAll",
  );
  return rows.map(toCategoryApiShape);
}

async function fetchAll() {
  const rows = await dbQuery(queries.selectAll, [], "expenses.selectAll");
  return rows.map(toApiShape);
}

async function fetchByDateRange(from, to) {
  const rows = await dbQuery(
    queries.selectByDateRange,
    [from, to],
    "expenses.selectByDateRange",
  );
  return rows.map(toApiShape);
}

// `actor` = authenticated user's email from req.user (never the request body).
async function create(input, actor) {
  if (!input.category?.trim()) {
    throw new ApiError(400, "category is required.");
  }
  if (input.amount === undefined || input.amount === null || Number.isNaN(Number(input.amount))) {
    throw new ApiError(400, "amount is required.");
  }

  let date = input.date;
  if (isMonthly(input.category)) {
    // One entry per category per month. 0 is allowed (e.g. no gas bill).
    if (Number(input.amount) < 0) {
      throw new ApiError(400, "amount cannot be negative.");
    }
    const span = await resolveMonth(input.month);
    const existing = await entriesInSpan(span, input.category);
    if (existing.length > 0) {
      throw new ApiError(
        409,
        `${MONTHLY_LABELS[input.category]} is already entered for ${span.label}. Edit the existing entry instead.`,
      );
    }
    date = span.date;
  } else {
    if (Number(input.amount) <= 0) {
      throw new ApiError(400, "amount must be greater than zero.");
    }
    if (!input.date) {
      throw new ApiError(400, "date is required.");
    }
    await calendarService.requireWeekForDate(input.date);
  }

  const rows = await dbQuery(
    queries.insert,
    [input.category, input.amount, date, input.note || null, actor ?? null],
    "expenses.insert",
  );
  return toApiShape(rows[0]);
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

  let category = patch.category ?? existing.category;
  let date = patch.date ?? existing.date;

  if (category !== existing.category && (isMonthly(category) || isMonthly(existing.category))) {
    throw new ApiError(400, "The category of an expense cannot be changed. Delete it and add a new one.");
  }

  if (isMonthly(existing.category)) {
    // Month and category are locked; only amount and note can change.
    category = existing.category;
    date = existing.date;
    if (patch.amount !== undefined && Number(patch.amount) < 0) {
      throw new ApiError(400, "amount cannot be negative.");
    }
  } else {
    if (patch.amount !== undefined && Number(patch.amount) <= 0) {
      throw new ApiError(400, "amount must be greater than zero.");
    }
    await calendarService.requireWeekForDate(date);
  }

  const rows = await dbQuery(
    queries.updateReturning,
    [
      id,
      category,
      patch.amount ?? existing.amount,
      date,
      patch.note ?? existing.note,
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
  MONTHLY_CATEGORIES,
  MONTHLY_LABELS,
  fetchAllCategories,
  fetchAll,
  fetchByDateRange,
  create,
  update,
  remove,
};
