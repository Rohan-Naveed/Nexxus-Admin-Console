import { apiClient } from "./apiClient";
import {
  monthKeyOf,
  getSalaryPeriodLabel,
  parseMonthKey,
} from "../utils/slipCalc";

// Real backend wiring for salary slips. Nothing here is Google-Sheets-
// related — a slip is generated from whatever gross figure the admin
// confirms in the Salary Slips form (pre-filled from payroll_weeks where
// available, editable either way), not synced directly — so this is
// fully wired with no pending stub. See backend/src/modules/salarySlips.
//
// The DB (and therefore the API) stores periodYear/periodMonth, not the
// "YYYY-MM" `monthKey` string the rest of the frontend keys slips by,
// and doesn't store `periodLabel`/`usdRate` at all (both are display
// values derived from other fields — see slipCalc.js). This module
// reconstructs all three on every read so nothing downstream (
// SalarySlipsTab, SlipHistoryList, pdfSlip.js) needs to change.
function fromApiShape(row) {
  const monthKey = monthKeyOf(row.periodYear, row.periodMonth - 1);
  return {
    ...row,
    monthKey,
    periodLabel: getSalaryPeriodLabel(monthKey),
    usdRate: row.usdPerPkr > 0 ? 1 / row.usdPerPkr : 0,
  };
}

export function createSlipService() {
  return {
    async fetchAllSlips() {
      const rows = await apiClient.get("/salary-slips");
      return rows.map(fromApiShape);
    },

    async fetchSlipHistory() {
      return apiClient.get("/salary-slips/history");
    },

    async fetchSlipsForDispatcher(dispatcherId) {
      const rows = await apiClient.get(
        `/salary-slips?dispatcherId=${dispatcherId}`,
      );
      return rows.map(fromApiShape);
    },

    async fetchSlip(dispatcherId, monthKey) {
      const { year, monthIndex } = parseMonthKey(monthKey);
      try {
        const row = await apiClient.get(
          `/salary-slips/${dispatcherId}/${year}/${monthIndex + 1}`,
        );
        return row ? fromApiShape(row) : null;
      } catch {
        // Backend 404s when no slip exists for that dispatcher/period —
        // treat that the same as "no slip yet" rather than an error.
        return null;
      }
    },

    // `slip` is the full computed+identity payload built by
    // SlipPreviewCard (see src/utils/slipCalc.js#computeSlipPreview plus
    // identity fields). Generating again for the same dispatcher/month
    // overwrites the existing row server-side (ON CONFLICT ... DO
    // UPDATE on the same UNIQUE(dispatcher_id, period_year, period_month)
    // used here) — a deliberate "regenerate", not a duplicate.
    async generateSlip(slip) {
      const row = await apiClient.post("/salary-slips", slip);
      return fromApiShape(row);
    },

    async sendSlipEmail(slipId, pdfBase64) {
      const row = await apiClient.post(`/salary-slips/${slipId}/send`, {
        pdfBase64,
      });
      return fromApiShape(row);
    },
  };
}
