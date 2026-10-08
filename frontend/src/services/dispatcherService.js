import { apiClient } from "./apiClient";
import { deriveMonthlyFigures } from "../utils/salary";

// Real backend wiring for dispatcher profiles/rules (name, alias,
// commission %, base salary, fuel allowance, profile fields, and Google
// Sheet link. See backend/src/modules/dispatchers.
//
// ---------------------------------------------------------------------
// GOOGLE SHEETS TODO — see /GOOGLE_SHEETS_TODO.md at the project root.
// ---------------------------------------------------------------------
// `gross` and `lastGross` are NOT dispatcher
// table columns — gross comes from the `payroll_weeks` table, which is
// populated by the Google Sheets sync (see the Sync Center tab and
// backend/src/modules/sync). Per-dispatcher sync status/timestamps used to
// be stubbed here (`freshness`, `lastSynced`); they were removed because
// all sync state now lives in the Sync Center.
// Until that job exists, every dispatcher below is returned with gross
// zeroed out and a "not synced yet" status instead of real figures, so
// the rest of the app (which already treats missing/zero gross as a
// valid "nothing synced" state) degrades correctly rather than showing
// fabricated numbers. Swap `buildPendingSyncFields()` below for real
// `payroll_weeks` queries once that job is writing data.
// ---------------------------------------------------------------------

function buildPendingSyncFields() {
  return {
    gross: { Weekly: 0, Monthly: 0, Yearly: 0 },
    lastGross: { Weekly: null, Monthly: null, Yearly: null },
  };
}

// DB rows are already camelCase (translated server-side by
// dispatchers.service.js#toApiShape), but the frontend additionally
// wants basicSalary/fuelAllowance as {Weekly, Monthly, Yearly} objects
// (the DB only stores the Monthly figure — see schema.sql's design
// notes) and gross/sync fields the DB doesn't have yet (see above).
function fromApiShape(row) {
  return {
    id: row.id,
    name: row.name,
    employeeType: row.employeeType || "dispatcher",
    alias: row.alias,
    googleSheetId: row.googleSheetId || "",
    googleSheetTab: row.googleSheetTab || "",
    percentage: row.percentage,
    basicSalary: deriveMonthlyFigures(row.basicSalaryMonthly),
    fuelAllowance: deriveMonthlyFigures(row.fuelAllowanceMonthly),
    profile: { ...row.profile },
    ...buildPendingSyncFields(),
  };
}

// Inverse of the above, for POST/PUT bodies: the backend only stores a
// single Monthly figure for salary/allowance — Weekly/Yearly are
// re-derived client-side on every read (see fromApiShape above), so
// they're never sent.
function toApiBody(input) {
  return {
    name: input.name,
    employeeType: input.employeeType || "dispatcher",
    alias: input.alias,
    googleSheetId: input.googleSheetId,
    googleSheetTab: input.googleSheetTab,
    percentage: input.percentage,
    basicSalaryMonthly: input.basicSalary?.Monthly ?? 0,
    fuelAllowanceMonthly: input.fuelAllowance?.Monthly ?? 0,
    profile: input.profile,
  };
}

export function createDispatcherService() {
  return {
    async fetchDispatchers() {
      const rows = await apiClient.get("/dispatchers");
      return rows.map(fromApiShape);
    },

    async addDispatcher(input) {
      const row = await apiClient.post("/dispatchers", toApiBody(input));
      return fromApiShape(row);
    },

    async updateDispatcher(id, patch) {
      const row = await apiClient.put(`/dispatchers/${id}`, toApiBody(patch));
      return fromApiShape(row);
    },

    async deleteDispatcher(id) {
      const result = await apiClient.delete(`/dispatchers/${id}`);
      return Boolean(result?.deleted);
    },
  };
}
