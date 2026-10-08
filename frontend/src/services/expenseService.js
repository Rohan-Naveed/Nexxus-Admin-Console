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
