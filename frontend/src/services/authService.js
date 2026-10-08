// Thin wrapper over the /api/auth endpoints, following the same
// createXService() pattern as the other service modules.
import { apiClient } from "./apiClient";

export function createAuthService() {
  return {
    signup: (email, password, role) =>
      apiClient.post("/auth/signup", { email, password, role }),
    login: (email, password) => apiClient.post("/auth/login", { email, password }),
    logout: () => apiClient.post("/auth/logout", {}),
    // Returns the current user, or null if not authenticated — a 401
    // here just means "no session yet", not a real error.
    me: async () => {
      try {
        return await apiClient.get("/auth/me");
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
  };
}
