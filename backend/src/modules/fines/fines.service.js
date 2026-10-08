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
  return { key: row.key, label: row.label };
}

async function fetchAllTypes() {
  const rows = await dbQuery(typeQueries.selectAll, [], "fineTypes.selectAll");
  return rows.map(toTypeApiShape);
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
  if (input.amount === undefined || input.amount === null) {
    throw new ApiError(400, "amount is required.");
  }
  if (!input.date) throw new ApiError(400, "date is required.");
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
  await calendarService.requireWeekForDate(patch.date ?? existing.date);

  const rows = await dbQuery(
    queries.updateReturning,
    [
      id,
      patch.dispatcherId ?? existing.dispatcherId,
      patch.type ?? existing.type,
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
  fetchAll,
  fetchForDispatcher,
  create,
  update,
  remove,
};
