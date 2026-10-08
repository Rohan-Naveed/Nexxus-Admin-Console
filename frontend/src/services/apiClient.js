// Thin fetch wrapper shared by every service module (dispatcherService,
// expenseService, finesService, slipService). Centralizes the backend
// base URL and request/error handling so individual services just call
// apiClient.get/post/put/delete with a path and don't each reimplement
// fetch boilerplate.
//
// Base URL comes from frontend/config.json so it can point at a different
// backend without changing this module; falls back to the backend's local
// dev default (see
// backend/config/config.json — port 4000, routes mounted under /api).
import config from "../../config.json";

const API_BASE_URL = config.VITE_API_BASE_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    // Sends/accepts the httpOnly session cookie set by /api/auth/login —
    // required since the frontend and API run on different ports/origins.
    credentials: "include",
    ...options,
  });

  // Every current endpoint returns JSON (including error bodies), and
  // none return a 204 — but guard against an empty body anyway so a
  // future no-content response doesn't throw on `.json()`.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Matches backend/src/middleware/errorHandler.js's error shape:
    // { error: { message, details } }.
    const message =
      data?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
};
