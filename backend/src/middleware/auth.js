const authService = require("../modules/auth/auth.service");
const config = require("../../config/config.json");
const { ApiError } = require("./errorHandler");

// Verifies the session cookie and attaches { id, email, role } to
// req.user. Does NOT check role — see requireAdmin for that. Any route
// that just needs "someone is logged in" (e.g. GET /api/auth/me) uses
// this alone.
function requireAuth(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) {
    return next(new ApiError(401, "Not authenticated."));
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch (err) {
    return next(new ApiError(401, "Session expired or invalid. Please log in again."));
  }
}

// The entire existing admin console (dispatchers, payroll, expenses,
// fines, salary slips, rates, reports) is admin-only. A logged-in
// 'user' account is authenticated but gets a 403 here — the frontend
// uses that distinction to show the "coming soon" placeholder instead
// of an error page.
function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user.role !== "admin") {
      return next(new ApiError(403, "Admin access required."));
    }
    return next();
  });
}

module.exports = { requireAuth, requireAdmin };
