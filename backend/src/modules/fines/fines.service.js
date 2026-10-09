const { dbQuery, dbExecute } = require("../../db/helpers");
const db = require("../../../config/db.json");
const { ApiError } = require("../../middleware/errorHandler");
const calendarService = require("../calendar/calendar.service");

const queries = db.fines;
const typeQueries = db.fineTypes;

function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    dispatcherId: row.dispatcher_id,
    type: row.type_key,
    typeLabel: row.type_label || row.type_key,
    amount: Number(row.amount),
    date: row.fine_date,
    reason: row.reason || "",
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function toTypeApiShape(row) {
  return {
    key: row.key,
    label: row.label,
    active: row.is_active,
    usageCount: Number(row.usage_count ?? 0),
  };
}

async function fetchAllTypes(activeOnly = false) {
  const rows = await dbQuery(
    activeOnly ? typeQueries.selectActive : typeQueries.selectAll,
    [],
    activeOnly ? "fineTypes.selectActive" : "fineTypes.selectAll",
  );
  return rows.map(toTypeApiShape);
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

async function createType(input) {
  const label = String(input.label || "").trim();
  if (!label) throw new ApiError(400, "A category name is required.");
  if (label.length > 80) throw new ApiError(400, "Category names must be 80 characters or fewer.");
  try {
    const rows = await dbQuery(typeQueries.insert, [categoryKey(label), label], "fineTypes.insert");
    return toTypeApiShape(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "A deduction category with this name already exists.");
    }
    throw err;
  }
}

async function updateType(key, input) {
  const found = await dbQuery(typeQueries.selectByKey, [key], "fineTypes.selectByKey");
  if (!found[0]) throw new ApiError(404, `Deduction category ${key} not found.`);
  const label = input.label === undefined ? found[0].label : String(input.label).trim();
  if (!label) throw new ApiError(400, "A category name is required.");
  if (label.length > 80) throw new ApiError(400, "Category names must be 80 characters or fewer.");
  const active = input.active === undefined ? found[0].is_active : Boolean(input.active);
  const rows = await dbQuery(typeQueries.update, [key, label, active], "fineTypes.update");
  return toTypeApiShape(rows[0]);
}

async function archiveType(key) {
  return updateType(key, { active: false });
}

async function deleteType(key) {
  const found = await dbQuery(typeQueries.selectByKey, [key], "fineTypes.selectByKey");
  if (!found[0]) throw new ApiError(404, `Deduction category ${key} not found.`);
  const usage = await dbQuery(typeQueries.usageCount, [key], "fineTypes.usageCount");
  if (Number(usage[0]?.count ?? 0) > 0) {
    throw new ApiError(409, "This deduction category has linked records. Archive it to preserve history.");
  }
  try {
    const rowCount = await dbExecute(typeQueries.delete, [key], "fineTypes.delete");
    if (rowCount === 0) throw new ApiError(404, `Deduction category ${key} not found.`);
  } catch (err) {
    if (err.code === "23503") {
      throw new ApiError(409, "This deduction category has linked records. Archive it to preserve history.");
    }
    throw err;
  }
  return { key, deleted: true };
}

async function fetchAll() {
  const rows = await dbQuery(queries.selectAll, [], "fines.selectAll");
  return rows.map(toApiShape);
}

async function fetchForDispatcher(dispatcherId) {
  const rows = await dbQuery(
    queries.selectByDispatcher,
    [dispatcherId],
    "fines.selectByDispatcher",
  );
  return rows.map(toApiShape);
}

// `actor` = authenticated user's email from req.user (never the request body).
async function create(input, actor) {
  if (!input.dispatcherId) throw new ApiError(400, "dispatcherId is required.");
  if (!input.type?.trim()) throw new ApiError(400, "type is required.");
  if (input.amount === undefined || input.amount === null || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
    throw new ApiError(400, "amount must be greater than zero.");
  }
  if (!input.date) throw new ApiError(400, "date is required.");
  const typeRows = await dbQuery(typeQueries.selectByKey, [input.type], "fineTypes.selectByKey");
  if (!typeRows[0]?.is_active) throw new ApiError(400, "Choose an active deduction category.");
  await calendarService.requireWeekForDate(input.date);

  const rows = await dbQuery(
    queries.insert,
    [
      input.dispatcherId,
      input.type,
      input.amount,
      input.date,
      input.reason || null,
      input.note || null,
      actor ?? null,
    ],
    "fines.insert",
  );
  return toApiShape(rows[0]);
}

async function update(id, patch, actor) {
  const existingRows = await dbQuery(
    queries.selectById,
    [id],
    "fines.selectById",
  );
  const existing = toApiShape(existingRows[0]);
  if (!existing) {
    throw new ApiError(404, `Fine ${id} not found.`);
  }
  const type = patch.type ?? existing.type;
  const typeRows = await dbQuery(typeQueries.selectByKey, [type], "fineTypes.selectByKey");
  if (!typeRows[0] || (!typeRows[0].is_active && type !== existing.type)) {
    throw new ApiError(400, "Choose an active deduction category.");
  }
  if (patch.amount !== undefined && (!Number.isFinite(Number(patch.amount)) || Number(patch.amount) <= 0)) {
    throw new ApiError(400, "amount must be greater than zero.");
  }
  await calendarService.requireWeekForDate(patch.date ?? existing.date);

  const rows = await dbQuery(
    queries.updateReturning,
    [
      id,
      patch.dispatcherId ?? existing.dispatcherId,
      type,
      patch.amount ?? existing.amount,
      patch.date ?? existing.date,
      patch.reason ?? existing.reason,
      patch.note ?? existing.note,
      actor ?? null,
    ],
    "fines.updateReturning",
  );
  return toApiShape(rows[0]);
}

async function remove(id) {
  const rowCount = await dbExecute(queries.delete, [id], "fines.delete");
  if (rowCount === 0) {
    throw new ApiError(404, `Fine ${id} not found.`);
  }
  return { id, deleted: true };
}

module.exports = {
  fetchAllTypes,
  createType,
  updateType,
  archiveType,
  deleteType,
  fetchAll,
  fetchForDispatcher,
  create,
  update,
  remove,
};
