import { apiClient } from "./apiClient";

// Real backend wiring for expenses (dinner/misc/electricity/gas/water).
// Nothing here is Google-Sheets-related — expenses are hand-entered by
// the admin, not synced from a dispatcher sheet — so this is fully wired
// with no pending stub. See backend/src/modules/expenses.
//
// The API's shape ({ id, category, amount, date, note, createdAt,
// updatedAt }) already matches what every component in this codebase
// expects, so no field mapping is needed here.

export function createExpenseService() {
  return {
    async fetchAllCategories() {
      return apiClient.get("/expenses/categories");
    },

    async createCategory(category) {
      return apiClient.post("/expenses/categories", category);
    },

    async updateCategory(key, patch) {
      return apiClient.put(`/expenses/categories/${encodeURIComponent(key)}`, patch);
    },

    async archiveCategory(key) {
      return apiClient.delete(`/expenses/categories/${encodeURIComponent(key)}`);
    },

    async deleteCategory(key) {
      return apiClient.delete(`/expenses/categories/${encodeURIComponent(key)}/permanent`);
    },

    async fetchAllExpenses() {
      return apiClient.get("/expenses");
    },

    async addExpense(entry) {
      return apiClient.post("/expenses", entry);
    },

    async updateExpense(id, patch) {
      return apiClient.put(`/expenses/${id}`, patch);
    },

    async deleteExpense(id) {
      const result = await apiClient.delete(`/expenses/${id}`);
      return Boolean(result?.deleted);
    },
  };
}
