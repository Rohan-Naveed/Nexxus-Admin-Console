import { apiClient } from "./apiClient";

export function createRateService() {
  return {
    async fetchUsdPerPkr() {
      const latest = await apiClient.get("/rates/usd-pkr/latest");
      return latest?.ratePkrPerUsd ? 1 / latest.ratePkrPerUsd : null;
    },

    async fetchTaxPercent() {
      const latest = await apiClient.get("/rates/tax/latest");
      return latest?.taxPercent ?? null;
    },

    fetchUsdRates() {
      return apiClient.get("/rates/usd-pkr");
    },

    fetchTaxRates() {
      return apiClient.get("/rates/tax");
    },

    saveUsdRate(rate) {
      return apiClient.post("/rates/usd-pkr", rate);
    },

    saveTaxRate(rate) {
      return apiClient.post("/rates/tax", rate);
    },

    fetchTrackingProperties() {
      return apiClient.get("/rates/tracking");
    },

    saveTrackingProperties(properties) {
      return apiClient.put("/rates/tracking", properties);
    },
  };
}
