import { apiClient } from "./apiClient";

// Real backend wiring for fines/deductions (late, violation, other).
// Nothing here is Google-Sheets-related — fines are hand-entered by the
// admin, not synced from a dispatcher sheet — so this is fully wired
// with no pending stub. See backend/src/modules/fines.
//
// The API's shape ({ id, dispatcherId, type, amount, date, reason, note,
// createdAt, updatedAt }) already matches what every component in this
// codebase expects, so no field mapping is needed here.

export function createFinesService() {
  return {
    async fetchAllCategories() {
      return apiClient.get("/fines/types");
    },

    async createCategory(category) {
      return apiClient.post("/fines/types", category);
    },

    async updateCategory(key, patch) {
      return apiClient.put(`/fines/types/${encodeURIComponent(key)}`, patch);
    },

    async archiveCategory(key) {
      return apiClient.delete(`/fines/types/${encodeURIComponent(key)}`);
    },

    async deleteCategory(key) {
      return apiClient.delete(`/fines/types/${encodeURIComponent(key)}/permanent`);
    },

    async fetchAllFines() {
      return apiClient.get("/fines");
    },

    async addFine(entry) {
      return apiClient.post("/fines", entry);
    },

    async updateFine(id, patch) {
      return apiClient.put(`/fines/${id}`, patch);
    },

    async deleteFine(id) {
      const result = await apiClient.delete(`/fines/${id}`);
      return Boolean(result?.deleted);
    },
  };
}
