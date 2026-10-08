const { dbQuery } = require("../../db/helpers");
const db = require("../../../config/db.json");
const { ApiError } = require("../../middleware/errorHandler");

const usdQueries = db.usdPkrRates;
const taxQueries = db.taxRates;
const propertyQueries = db.properties;

function toUsdApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    ratePkrPerUsd: Number(row.rate_pkr_per_usd),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function toTaxApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    taxPercent: Number(row.tax_percent),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

async function fetchAllUsdRates() {
  const rows = await dbQuery(usdQueries.selectAll, [], "usdPkrRates.selectAll");
  return rows.map(toUsdApiShape);
}

async function fetchLatestUsdRate() {
  const rows = await dbQuery(
    usdQueries.selectLatest,
    [],
    "usdPkrRates.selectLatest",
  );
  return toUsdApiShape(rows[0]);
}

// `actor` comes from the session (req.user.email), not the request body.
async function setUsdRate({ periodYear, periodMonth, ratePkrPerUsd }, actor) {
  if (!ratePkrPerUsd || ratePkrPerUsd <= 0) {
    throw new ApiError(400, "ratePkrPerUsd must be a positive number.");
  }
  const rows = await dbQuery(
    usdQueries.upsert,
    [periodYear, periodMonth, ratePkrPerUsd, actor ?? null],
    "usdPkrRates.upsert",
  );
  return toUsdApiShape(rows[0]);
}

async function fetchAllTaxRates() {
  const rows = await dbQuery(taxQueries.selectAll, [], "taxRates.selectAll");
  return rows.map(toTaxApiShape);
}

async function fetchLatestTaxRate() {
  const rows = await dbQuery(
    taxQueries.selectLatest,
    [],
    "taxRates.selectLatest",
  );
  return toTaxApiShape(rows[0]);
}

async function setTaxRate({ periodYear, periodMonth, taxPercent }, actor) {
  if (taxPercent === undefined || taxPercent < 0) {
    throw new ApiError(400, "taxPercent must be zero or a positive number.");
  }
  const rows = await dbQuery(
    taxQueries.upsert,
    [periodYear, periodMonth, taxPercent, actor ?? null],
    "taxRates.upsert",
  );
  return toTaxApiShape(rows[0]);
}

async function fetchTrackingProperties() {
  const rows = await dbQuery(
    propertyQueries.selectTracking,
    [],
    "properties.selectTracking",
  );
  const values = new Map(rows.map((row) => [row.property_key, row]));
  const grossProperty = values.get("gross_percentage");
  const trackingProperty = values.get("tracking_percentage");
  if (!grossProperty || !trackingProperty) {
    throw new ApiError(
      500,
      "Tracking percentages are not configured in the properties table. Apply migration 004 and set both values in Settings.",
    );
  }

  return {
    grossPercentage: Number(grossProperty.numeric_value),
    trackingPercentage: Number(trackingProperty.numeric_value),
    updatedAt: trackingProperty.updated_at,
    updatedBy: trackingProperty.updated_by,
  };
}

async function setTrackingProperties(input, actor) {
  const grossPercentage = Number(input.grossPercentage);
  const trackingPercentage = Number(input.trackingPercentage);
  if (
    !Number.isFinite(grossPercentage) ||
    grossPercentage <= 0 ||
    grossPercentage > 100
  ) {
    throw new ApiError(
      400,
      "grossPercentage must be greater than 0 and at most 100.",
    );
  }
  if (
    !Number.isFinite(trackingPercentage) ||
    trackingPercentage < 0 ||
    trackingPercentage > 100
  ) {
    throw new ApiError(400, "trackingPercentage must be between 0 and 100.");
  }
  await dbQuery(
    propertyQueries.upsertTracking,
    [grossPercentage, trackingPercentage, actor ?? null],
    "properties.upsertTracking",
  );
  return fetchTrackingProperties();
}

module.exports = {
  fetchAllUsdRates,
  fetchLatestUsdRate,
  setUsdRate,
  fetchAllTaxRates,
  fetchLatestTaxRate,
  setTaxRate,
  fetchTrackingProperties,
  setTrackingProperties,
};
