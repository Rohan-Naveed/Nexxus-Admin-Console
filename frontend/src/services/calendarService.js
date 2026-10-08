import { apiClient } from "./apiClient";

// The Week Calendar (admin-defined weeks) and the notification centre.
export function createCalendarService() {
  return {
    // Weeks for a range of months, each week flagged ended / synced / locked.
    // from/to are "YYYY-MM"; the server defaults to previous 3 months .. +6 months.
    getCalendar(from, to) {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return apiClient.get(`/calendar${qs ? `?${qs}` : ""}`);
    },

    // Every saved week — what the console's date logic runs on.
    getWeeks: () => apiClient.get("/calendar/weeks"),

    // [{ year, month, weeks: [{ weekNumber, startDate, endDate }] }]
    // A month with weeks: [] is cleared (back to "not set").
    saveMonths: (months) => apiClient.put("/calendar", { months }),

    getNotifications: () => apiClient.get("/notifications"),
  };
}
