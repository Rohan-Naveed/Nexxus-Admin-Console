const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const config = require("../config/config.json");
const requestLogger = require("./middleware/requestLogger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { requireAdmin } = require("./middleware/auth");

const authRoutes = require("./modules/auth/auth.routes");
const dispatchersRoutes = require("./modules/dispatchers/dispatchers.routes");
const payrollWeeksRoutes = require("./modules/payrollWeeks/payrollWeeks.routes");
const ratesRoutes = require("./modules/rates/rates.routes");
const expensesRoutes = require("./modules/expenses/expenses.routes");
const finesRoutes = require("./modules/fines/fines.routes");
const salarySlipsRoutes = require("./modules/salarySlips/salarySlips.routes");
const syncRoutes = require("./modules/sync/sync.routes");
const calendarRoutes = require("./modules/calendar/calendar.routes");
const notificationsRoutes = require("./modules/notifications/notifications.routes");

const app = express();

// credentials: true is required for the httpOnly session cookie to be
// sent/accepted cross-origin (frontend on :3000, API on :4000).
app.use(cors({ origin: config.server.corsOrigin, credentials: true }));
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use(requestLogger);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);

// Everything below is the admin console proper — a logged-in 'user'
// account gets a 403 from requireAdmin on all of it, which the
// frontend reads as "show the coming soon page".
app.use("/api/dispatchers", requireAdmin, dispatchersRoutes);
app.use("/api/payroll-weeks", requireAdmin, payrollWeeksRoutes);
app.use("/api/rates", requireAdmin, ratesRoutes);
app.use("/api/expenses", requireAdmin, expensesRoutes);
app.use("/api/fines", requireAdmin, finesRoutes);
app.use("/api/salary-slips", requireAdmin, salarySlipsRoutes);
app.use("/api/sync", requireAdmin, syncRoutes);
app.use("/api/calendar", requireAdmin, calendarRoutes);
app.use("/api/notifications", requireAdmin, notificationsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
