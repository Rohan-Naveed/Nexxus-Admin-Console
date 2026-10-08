import { ArrowUpRight, Plus, Pencil, X } from "lucide-react";
import { fmtMoney } from "../utils/formatters";

function ProfileActions({ employee, onOpenDispatcher, onEditDispatcher }) {
  return (
    <div className="pill-row employee-table-actions">
      <button
        className="icon-btn"
        onClick={() => onEditDispatcher(employee)}
        aria-label={`Edit ${employee.name}`}
        title={`Edit ${employee.name}`}
      >
        <Pencil size={13} />
      </button>
      <button
        className="text-link"
        onClick={() => onOpenDispatcher(employee.id)}
      >
        Open profile <ArrowUpRight size={14} />
      </button>
    </div>
  );
}

export default function DispatchersTab({
  dispatchers,
  currency,
  usdPerPkr,
  period,
  feedback,
  onDismissFeedback,
  onOpenDispatcher,
  onAddDispatcher,
  onEditDispatcher,
}) {
  const activeCount = dispatchers.filter(
    (dispatcher) => dispatcher.profile?.status !== "left",
  ).length;
  const leftCount = dispatchers.filter(
    (dispatcher) => dispatcher.profile?.status === "left",
  ).length;
  const unlinkedSheetCount = dispatchers.filter(
    (dispatcher) =>
      dispatcher.employeeType === "dispatcher" &&
      (!dispatcher.googleSheetId?.trim() || !dispatcher.googleSheetTab?.trim()),
  ).length;
  const dispatcherRows = dispatchers.filter(
    (employee) => employee.employeeType === "dispatcher",
  );
  const otherEmployeeRows = dispatchers.filter(
    (employee) => employee.employeeType === "employee",
  );

  return (
    <div className="content-stack">
      {feedback && (
        <div className="action-success-banner" role="status">
          <span>{feedback.message}</span>
          <button
            type="button"
            className="action-success-dismiss"
            onClick={onDismissFeedback}
            aria-label="Dismiss success message"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="stats-grid">
        <div className="panel">
          <div className="panel-title">Active employees</div>
          <div className="panel-number">{activeCount}</div>
          <div className="panel-sub">Currently on roster</div>
        </div>
        <div className="panel">
          <div className="panel-title">Left / inactive</div>
          <div className="panel-number">{leftCount}</div>
          <div className="panel-sub">No longer active</div>
        </div>
        <div className="panel">
          <div className="panel-title">Sheet not linked</div>
          <div className="panel-number">{unlinkedSheetCount}</div>
          <div className="panel-sub">Missing Google Sheet link/tab</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-head">
          <div>
            <h2 className="panel-title employee-profiles-title">
              Employee profiles
            </h2>
            <div className="panel-sub">
              Sheet links apply only to truck dispatchers.
            </div>
          </div>
          <div className="pill-row">
            <button className="soft-button" onClick={onAddDispatcher}>
              <Plus size={14} />
              Add employee
            </button>
          </div>
        </div>

        <section className="employee-profile-section">
          <div className="section-head employee-table-head">
            <div>
              <h3 className="panel-title employee-table-title">Dispatchers</h3>
              <div className="panel-sub">Commission-based profiles</div>
            </div>
            <span className="soft-pill">{dispatcherRows.length} total</span>
          </div>
          <div className="table-shell">
            <table className="employee-profile-table">
              <thead>
                <tr>
                  {[
                    "Dispatcher",
                    "Designation",
                    "Status",
                    "Commission",
                    `Base · ${period}`,
                    `Gross · ${period}`,
                    "Google Sheet",
                    "Actions",
                  ].map((header) => (
                    <th className="table-head" key={header}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dispatcherRows.map((dispatcher) => {
                  const sheetLinked = Boolean(
                    dispatcher.googleSheetId?.trim() &&
                    dispatcher.googleSheetTab?.trim(),
                  );
                  const isActive = dispatcher.profile?.status !== "left";
                  return (
                    <tr key={dispatcher.id}>
                      <td className="table-cell table-cell-strong">
                        {dispatcher.alias || dispatcher.name}
                        {dispatcher.alias &&
                          dispatcher.alias !== dispatcher.name && (
                            <div className="panel-sub">
                              Real name: {dispatcher.name}
                            </div>
                          )}
                      </td>
                      <td className="table-cell">
                        {dispatcher.profile?.designation || "Dispatcher"}
                      </td>
                      <td className="table-cell">
                        <span
                          className={`pill ${isActive ? "" : "pill-brick"}`}
                        >
                          {isActive ? "Active" : "Left"}
                        </span>
                      </td>
                      <td className="table-cell">
                        {(Number(dispatcher.percentage || 0) * 100)
                          .toFixed(1)
                          .replace(/\.0$/, "")}
                        %
                      </td>
                      <td className="table-cell">
                        {fmtMoney(
                          dispatcher.basicSalary?.[period] ?? 0,
                          currency,
                          usdPerPkr,
                        )}
                      </td>
                      <td className="table-cell table-cell-strong">
                        {fmtMoney(
                          dispatcher.gross?.[period] ?? 0,
                          currency,
                          usdPerPkr,
                        )}
                      </td>
                      <td className="table-cell">
                        <span
                          className={`pill ${sheetLinked ? "pill-route" : "pill-brick"}`}
                        >
                          {sheetLinked ? "Linked" : "Not linked"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <ProfileActions
                          employee={dispatcher}
                          onOpenDispatcher={onOpenDispatcher}
                          onEditDispatcher={onEditDispatcher}
                        />
                      </td>
                    </tr>
                  );
                })}
                {dispatcherRows.length === 0 && (
                  <tr>
                    <td className="table-cell" colSpan={8}>
                      No dispatcher profiles yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="employee-profile-section">
          <div className="section-head employee-table-head">
            <div>
              <h3 className="panel-title employee-table-title">
                Other employees
              </h3>
              <div className="panel-sub">Fixed-salary profiles</div>
            </div>
            <span className="soft-pill">{otherEmployeeRows.length} total</span>
          </div>
          <div className="table-shell">
            <table className="employee-profile-table">
              <thead>
                <tr>
                  {[
                    "Employee",
                    "Designation",
                    "Status",
                    `Base · ${period}`,
                    "Actions",
                  ].map((header) => (
                    <th className="table-head" key={header}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otherEmployeeRows.map((employee) => {
                  const isActive = employee.profile?.status !== "left";
                  return (
                    <tr key={employee.id}>
                      <td className="table-cell table-cell-strong">
                        {employee.name}
                      </td>
                      <td className="table-cell">
                        {employee.profile?.designation || "Employee"}
                      </td>
                      <td className="table-cell">
                        <span
                          className={`pill ${isActive ? "" : "pill-brick"}`}
                        >
                          {isActive ? "Active" : "Left"}
                        </span>
                      </td>
                      <td className="table-cell">
                        {fmtMoney(
                          employee.basicSalary?.[period] ?? 0,
                          currency,
                          usdPerPkr,
                        )}
                      </td>
                      <td className="table-cell">
                        <ProfileActions
                          employee={employee}
                          onOpenDispatcher={onOpenDispatcher}
                          onEditDispatcher={onEditDispatcher}
                        />
                      </td>
                    </tr>
                  );
                })}
                {otherEmployeeRows.length === 0 && (
                  <tr>
                    <td className="table-cell" colSpan={5}>
                      No other employee profiles yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
