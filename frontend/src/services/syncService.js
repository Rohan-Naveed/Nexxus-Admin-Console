import { apiClient } from "./apiClient";

// Everything sync-related goes through the backend's /api/sync module —
// the Sync Center tab is the only place in the UI that talks to it.
export function createSyncService() {
  return {
    getSummary: () => apiClient.get("/sync/summary"),

    getStatus: (year, month) =>
      apiClient.get(`/sync/status?year=${year}&month=${month}`),

    getHistory(filters = {}) {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, value);
        }
      });
      return apiClient.get(`/sync/history?${params.toString()}`);
    },

    // { dispatcherIds: number[] | "all", year, month, weeks: number[] | "all", reRate?: boolean }
    // Resolves immediately with { runId, total, notRun }; poll getRun().
    startRun: (payload) => apiClient.post("/sync/run", payload),

    getRun: (runId) => apiClient.get(`/sync/runs/${runId}`),
  };
}
