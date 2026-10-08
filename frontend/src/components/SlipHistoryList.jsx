import { useMemo, useState } from "react";
import { Download, History } from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import { downloadSlipPdf } from "../utils/pdfSlip";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SlipHistoryList({ slips, dispatchers }) {
  const [dispatcherFilter, setDispatcherFilter] = useState("all");

  const sorted = useMemo(
    () =>
      [...slips]
        .filter(
          (slip) =>
            dispatcherFilter === "all" ||
            String(slip.dispatcherId) === dispatcherFilter,
        )
        .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1)),
    [slips, dispatcherFilter],
  );

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <div className="panel-title">Current slips</div>
          <div className="panel-sub">
            Latest saved slip per employee and month. Use the activity history
            below to see each generation and successful email send.
          </div>
        </div>
        <select
          className="form-select"
          style={{ maxWidth: 220 }}
          value={dispatcherFilter}
          onChange={(event) => setDispatcherFilter(event.target.value)}
        >
          <option value="all">All employees</option>
          {dispatchers.map((dispatcher) => (
            <option key={dispatcher.id} value={dispatcher.id}>
              {dispatcher.alias || dispatcher.name}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-row">
          <History
            size={14}
            style={{ marginRight: 6, verticalAlign: "-2px" }}
          />
          No slips generated yet.
        </div>
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                {[
                  "Employee",
                  "Period",
                  "Net Pay",
                  "Generated",
                  "Email status",
                  "",
                ].map((header) => (
                  <th key={header} className="table-head">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((slip) => (
                <tr key={slip.id}>
                  <td className="table-cell table-cell-strong">
                    {slip.dispatchAlias || slip.dispatcherName}
                    {slip.dispatchAlias &&
                    slip.dispatchAlias !== slip.dispatcherName
                      ? ` (${slip.dispatcherName})`
                      : ""}
                  </td>
                  <td className="table-cell">{slip.periodLabel}</td>
                  <td className="table-cell">{fmtMoney(slip.netPay, "PKR")}</td>
                  <td className="table-cell">
                    {new Date(slip.generatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="table-cell">
                    {slip.emailStatus === "sent" ? (
                      <>
                        <span className="pill pill-route">
                          Salary slip sent
                        </span>
                        <div className="panel-sub">
                          {formatDateTime(slip.emailSentAt)}
                        </div>
                      </>
                    ) : slip.emailStatus === "failed" ? (
                      <>
                        <span
                          className="pill pill-brick"
                          title={slip.emailLastError || "Email delivery failed"}
                        >
                          Failed
                        </span>
                        {slip.emailLastAttemptAt && (
                          <div className="panel-sub">
                            Attempted {formatDateTime(slip.emailLastAttemptAt)}
                          </div>
                        )}
                      </>
                    ) : slip.emailStatus === "sending" ? (
                      <span className="pill pill-muted">Sending</span>
                    ) : (
                      <span className="pill pill-muted">Not sent</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => downloadSlipPdf(slip)}
                      aria-label={`Download ${slip.dispatcherName} ${slip.periodLabel} slip`}
                    >
                      <Download size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
