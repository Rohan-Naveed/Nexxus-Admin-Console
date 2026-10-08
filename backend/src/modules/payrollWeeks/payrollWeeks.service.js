const { dbQuery, dbExecute } = require("../../db/helpers");
const queries = require("../../../config/db.json").payrollWeeks;
const { ApiError } = require("../../middleware/errorHandler");

function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    dispatcherId: row.dispatcher_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    weekNumber: row.week_number,
    grossAmount: row.gross_amount === null ? null : Number(row.gross_amount),
    grossPercentage: Number(row.gross_percentage),
    trackingPercentage: Number(row.tracking_percentage),
    trackingFeeAmount:
      row.tracking_fee_amount === null ? null : Number(row.tracking_fee_amount),
    syncedAt: row.synced_at,
    syncSource: row.sync_source,
  };
}

async function fetchForDispatcher(dispatcherId) {
  const rows = await dbQuery(
    queries.selectByDispatcher,
    [dispatcherId],
    "payrollWeeks.selectByDispatcher",
  );
  return rows.map(toApiShape);
}

async function fetchForDispatcherMonth(dispatcherId, year, month) {
  const rows = await dbQuery(
    queries.selectByDispatcherAndMonth,
    [dispatcherId, year, month],
    "payrollWeeks.selectByDispatcherAndMonth",
  );
  return rows.map(toApiShape);
}

async function fetchMonthlyTotals(year, month) {
  const rows = await dbQuery(
    queries.selectMonthlyTotals,
    [year, month],
    "payrollWeeks.selectMonthlyTotals",
  );
  return rows.map((row) => ({
    dispatcherId: row.dispatcher_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    monthlyGross: row.monthly_gross === null ? null : Number(row.monthly_gross),
    monthlyTrackingFees: Number(row.monthly_tracking_fees) || 0,
    syncedWeeks: Number(row.synced_weeks),
  }));
}

async function fetchYearlyTotals(year) {
  const rows = await dbQuery(
    queries.selectYearlyTotals,
    [year],
    "payrollWeeks.selectYearlyTotals",
  );
  return rows.map((row) => ({
    dispatcherId: row.dispatcher_id,
    periodYear: row.period_year,
    yearlyGross: row.yearly_gross === null ? null : Number(row.yearly_gross),
    yearlyTrackingFees: Number(row.yearly_tracking_fees) || 0,
  }));
}

// INTERNAL: called only by the sync core (modules/sync/sync.service.js),
// one call per dispatcher/month/week, safe to re-run (upsert on the unique
// key). There is deliberately NO public HTTP route for this any more — the
// Google Sheet is the source of truth, so nobody should be able to post
// arbitrary gross figures. grossAmount is in USD, exactly as it appears
// in the Google Sheet. Weeks are the ones the admin defined in the Week
// Calendar (calendar_weeks), so a month can have up to 6.
async function syncWeek({
  dispatcherId,
  periodYear,
  periodMonth,
  weekNumber,
  grossAmount,
  syncSource,
  grossPercentage,
  trackingPercentage,
  recalculateTrackingRates = false,
}) {
  if (!dispatcherId) throw new ApiError(400, "dispatcherId is required.");
  if (weekNumber < 1 || weekNumber > 6) {
    throw new ApiError(400, "weekNumber must be between 1 and 6.");
  }
  if (
    !Number.isFinite(Number(grossPercentage)) ||
    Number(grossPercentage) <= 0
  ) {
    throw new ApiError(
      400,
      "A valid grossPercentage from Settings is required.",
    );
  }
  if (
    !Number.isFinite(Number(trackingPercentage)) ||
    Number(trackingPercentage) < 0
  ) {
    throw new ApiError(
      400,
      "A valid trackingPercentage from Settings is required.",
    );
  }
  const trackingFeeAmount =
    grossAmount == null
      ? null
      : (Number(grossAmount) / (Number(grossPercentage) / 100)) *
        (Number(trackingPercentage) / 100);

  const rows = await dbQuery(
    queries.upsert,
    [
      dispatcherId,
      periodYear,
      periodMonth,
      weekNumber,
      grossAmount ?? null,
      syncSource || "google_sheets",
      grossPercentage,
      trackingPercentage,
      trackingFeeAmount,
      recalculateTrackingRates,
    ],
    "payrollWeeks.upsert",
  );
  return toApiShape(rows[0]);
}

// Every synced week (gross_amount not null), oldest first. grossAmount is
// USD as synced; the console converts it to PKR with each month's rate.
async function fetchAllSynced() {
  const rows = await dbQuery(
    queries.selectAllSynced,
    [],
    "payrollWeeks.selectAllSynced",
  );
  return rows.map(toApiShape);
}

async function fetchForMonth(year, month) {
  const rows = await dbQuery(
    queries.selectByMonth,
    [year, month],
    "payrollWeeks.selectByMonth",
  );
  return rows.map(toApiShape);
}

async function fetchSyncedSince(yearMonthInt) {
  return dbQuery(
    queries.selectSyncedSince,
    [yearMonthInt],
    "payrollWeeks.selectSyncedSince",
  );
}

async function remove(id) {
  const rowCount = await dbExecute(queries.delete, [id], "payrollWeeks.delete");
  if (rowCount === 0) {
    throw new ApiError(404, `Payroll week ${id} not found.`);
  }
  return { id, deleted: true };
}

module.exports = {
  fetchForDispatcher,
  fetchForDispatcherMonth,
  fetchMonthlyTotals,
  fetchYearlyTotals,
  fetchAllSynced,
  fetchForMonth,
  fetchSyncedSince,
  syncWeek,
  remove,
};
