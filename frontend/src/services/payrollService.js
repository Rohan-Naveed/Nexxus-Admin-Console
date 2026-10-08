import { apiClient } from "./apiClient";

// Synced payroll weeks (payroll_weeks). grossAmount is USD, exactly as it
// is in the Google Sheet; the console converts it to PKR with each
// month's rate (see src/data/payrollHistory.js).
export function createPayrollService() {
  return {
    // [{ dispatcherId, periodYear, periodMonth, weekNumber, grossAmount, syncedAt }]
    fetchAllWeeks: () => apiClient.get("/payroll-weeks"),
  };
}
