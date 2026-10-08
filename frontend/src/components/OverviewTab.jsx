import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useEffect, useState } from "react";
import { TrendingUp, Users } from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import KPICard from "./KPICard";

export default function OverviewTab({
  dispatchers,
  employees = [],
  currency,
  usdPerPkr,
  period,
  periodLabel,
  totals,
  chartData,
  syncService,
  onOpenSyncCenter,
}) {
  // Small read-only sync-health line; all sync actions live in Sync Center.
  const [syncSummary, setSyncSummary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    syncService
      ?.getSummary()
      .then((summary) => {
        if (!cancelled) setSyncSummary(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [syncService]);

  return (
    <div className="content-stack">
      {syncSummary && (
        <div className="sync-health">
          <span
            className={`sync-health-dot ${syncSummary.failedCount ? "bad" : ""}`}
          />
          <span>
            {syncSummary.failedCount
              ? `${syncSummary.failedCount} week${syncSummary.failedCount === 1 ? "" : "s"} failed to sync`
              : "Sync is healthy"}
            {syncSummary.lastSchedulerSyncAt
              ? ` · last scheduler sync ${new Date(syncSummary.lastSchedulerSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : ""}
          </span>
          <button className="text-link" onClick={onOpenSyncCenter}>
            Open Sync Center
          </button>
        </div>
      )}
      <div className="stats-grid">
        <KPICard
          label={`Total Gross · ${periodLabel}`}
          value={fmtMoney(totals.gross, currency, usdPerPkr)}
          sub={`${totals.active} active dispatchers`}
          icon={TrendingUp}
        />
        {/*
          Loads and Avg/Load KPI cards removed — load-count data isn't
          available from the current Google Sheets sync. Re-enable once
          dispatcher.loads is populated again (see src/data/dispatchers.js).

          <KPICard
            label={`Loads · ${periodLabel}`}
            value={totals.loads}
            sub="Across all dispatchers"
            icon={Package}
          />
          <KPICard
            label="Avg. per Load"
            value={fmtMoney(totals.avg, currency, usdPerPkr)}
            sub="Weighted average"
            icon={Truck}
          />
        */}
        <KPICard
          label="Active Dispatchers"
          value={totals.active}
          sub="On the roster"
          icon={Users}
        />
      </div>

      <div className="content-grid">
        <div className="panel panel-compact">
          <div className="panel-title">Gross by Dispatcher</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ left: -10, right: 10, top: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--line)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fontFamily: "IBM Plex Sans" }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                formatter={(value) => fmtMoney(value, currency, usdPerPkr)}
                contentStyle={{
                  fontFamily: "IBM Plex Sans",
                  fontSize: 12.5,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                }}
              />
              <Bar dataKey="gross" fill="var(--route)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-title">Dispatcher Activity</div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  {["Dispatcher", `Gross · ${periodLabel}`].map((header) => (
                    <th key={header} className="table-head">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dispatchers.map((dispatcher) => (
                  <tr key={dispatcher.id}>
                    <td className="table-cell table-cell-strong">
                      {dispatcher.name}
                    </td>
                    {/* Loads and Avg/Load columns removed — see note above. */}
                    <td className="table-cell table-cell-strong">
                      {fmtMoney(
                        dispatcher.gross?.[period] ?? 0,
                        currency,
                        usdPerPkr,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {employees.some((employee) => employee.employeeType === "employee") && (
        <div className="panel">
          <div className="section-head">
            <div>
              <div className="panel-title">Fixed-salary employees</div>
              <div className="panel-sub">
                Monthly base salary · no gross or Sheets sync
              </div>
            </div>
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  {["Employee", "Designation", "Monthly base salary"].map(
                    (header) => (
                      <th key={header} className="table-head">
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((employee) => employee.employeeType === "employee")
                  .map((employee) => (
                    <tr key={employee.id}>
                      <td className="table-cell table-cell-strong">
                        {employee.name}
                      </td>
                      <td className="table-cell">
                        {employee.profile?.designation || "Employee"}
                      </td>
                      <td className="table-cell table-cell-strong">
                        {fmtMoney(
                          employee.basicSalary?.Monthly ?? 0,
                          currency,
                          usdPerPkr,
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
