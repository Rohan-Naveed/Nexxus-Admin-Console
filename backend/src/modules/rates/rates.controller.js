const service = require("./rates.service");

async function listUsdRates(req, res) {
  res.json(await service.fetchAllUsdRates());
}

async function latestUsdRate(req, res) {
  res.json(await service.fetchLatestUsdRate());
}

async function upsertUsdRate(req, res) {
  res.status(201).json(await service.setUsdRate(req.body, req.user.email));
}

async function listTaxRates(req, res) {
  res.json(await service.fetchAllTaxRates());
}

async function latestTaxRate(req, res) {
  res.json(await service.fetchLatestTaxRate());
}

async function upsertTaxRate(req, res) {
  res.status(201).json(await service.setTaxRate(req.body, req.user.email));
}

async function trackingProperties(req, res) {
  res.json(await service.fetchTrackingProperties());
}

async function updateTrackingProperties(req, res) {
  res.json(await service.setTrackingProperties(req.body, req.user.email));
}

module.exports = {
  listUsdRates,
  latestUsdRate,
  upsertUsdRate,
  listTaxRates,
  latestTaxRate,
  upsertTaxRate,
  trackingProperties,
  updateTrackingProperties,
};
