import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { deriveMonthlyFigures } from "../utils/salary";

function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function toNumber(value) {
  const n = Number(value);
  return value === "" || Number.isNaN(n) ? 0 : n;
}

export default function DispatcherFormModal({
  mode, // "add" | "edit"
  dispatcher,
  onClose,
  onSubmit,
  onDelete,
}) {
  const profile = dispatcher?.profile ?? {};
  const isEdit = mode === "edit";
  const [employeeType, setEmployeeType] = useState(
    dispatcher?.employeeType ?? "dispatcher",
  );
  const isDispatcher = employeeType === "dispatcher";

  const [name, setName] = useState(dispatcher?.name ?? "");
  const [alias, setAlias] = useState(dispatcher?.alias ?? "");
  const [googleSheetId, setGoogleSheetId] = useState(
    dispatcher?.googleSheetId ?? "",
  );
  const [googleSheetTab, setGoogleSheetTab] = useState(
    dispatcher?.googleSheetTab ?? "",
  );
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [joinedDate, setJoinedDate] = useState(
    profile.joinedDate ?? todayIso(),
  );
  const [status, setStatus] = useState(profile.status ?? "active");
  const [leftDate, setLeftDate] = useState(profile.leftDate ?? "");
  const [designation, setDesignation] = useState(
    profile.designation ??
      (dispatcher?.employeeType === "employee" ? "Employee" : "Dispatcher"),
  );
  const [cnic, setCnic] = useState(profile.cnic ?? "");
  const [accountNumber, setAccountNumber] = useState(
    profile.accountNumber ?? "",
  );
  const [percentage, setPercentage] = useState(
    dispatcher ? String((dispatcher.percentage ?? 0) * 100) : "0",
  );
  const [basicMonthly, setBasicMonthly] = useState(
    dispatcher ? String(dispatcher.basicSalary?.Monthly ?? 0) : "",
  );
  const [fuelMonthly, setFuelMonthly] = useState(
    dispatcher ? String(dispatcher.fuelAllowance?.Monthly ?? 0) : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const derivedBasicSalary = deriveMonthlyFigures(toNumber(basicMonthly));
  const derivedFuelAllowance = deriveMonthlyFigures(toNumber(fuelMonthly));

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Enter the employee's name.");
      return;
    }
    if (isDispatcher && !alias.trim()) {
      setError("Enter the dispatching alias (the name they dispatch under).");
      return;
    }
    if (!joinedDate) {
      setError("Pick a joined date.");
      return;
    }
    if (
      !isDispatcher &&
      (!basicMonthly ||
        Number(basicMonthly) <= 0 ||
        Number.isNaN(Number(basicMonthly)))
    ) {
      setError("Enter a monthly base salary greater than zero.");
      return;
    }
    const commission = Number(percentage);
    if (
      isDispatcher &&
      (percentage === "" ||
        Number.isNaN(commission) ||
        commission < 0 ||
        commission > 100)
    ) {
      setError("Commission % should be a number between 0 and 100.");
      return;
    }
    if (status === "left" && !leftDate) {
      setError("Pick the date this employee left.");
      return;
    }
    if (status === "left" && leftDate && leftDate < joinedDate) {
      setError("Left date can't be before the joined date.");
      return;
    }

    const payload = {
      employeeType,
      name: name.trim(),
      alias: isDispatcher ? alias.trim() : name.trim(),
      googleSheetId: isDispatcher ? googleSheetId.trim() : "",
      googleSheetTab: isDispatcher ? googleSheetTab.trim() : "",
      percentage: isDispatcher ? commission / 100 : 0,
      // Gross is intentionally not set here — it's earned/output data that
      // comes from the Sheets/DB sync, not something an admin types in.
      // Leaving it out on add defaults it to 0 (service-side), and on edit
      // leaves whatever gross figure is already on file untouched.
      basicSalary: derivedBasicSalary,
      fuelAllowance: isDispatcher
        ? derivedFuelAllowance
        : deriveMonthlyFigures(0),
      profile: {
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        dob: dob || null,
        gender,
        joinedDate,
        status,
        leftDate: status === "left" ? leftDate : null,
        designation:
          designation.trim() || (isDispatcher ? "Dispatcher" : "Employee"),
        cnic: cnic.trim(),
        accountNumber: accountNumber.trim(),
      },
    };

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (submitError) {
      setError(
        submitError.message ||
          `Could not ${isEdit ? "update" : "add"} the dispatcher.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit employee" : "Add employee"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? "Edit employee" : "Add employee"}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="expense-form" onSubmit={handleSubmit}>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label" htmlFor="employee-type">
                Employee type
              </label>
              <select
                id="employee-type"
                className="form-select"
                value={employeeType}
                onChange={(event) => {
                  setEmployeeType(event.target.value);
                  setDesignation(
                    event.target.value === "dispatcher"
                      ? "Dispatcher"
                      : "Employee",
                  );
                }}
              >
                <option value="dispatcher">Truck dispatcher</option>
                <option value="employee">Other employee</option>
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-name">
                Name
              </label>
              <input
                id="dispatcher-name"
                type="text"
                className="form-input"
                placeholder="Employee name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {isDispatcher && (
              <div className="form-group">
                <label className="form-label" htmlFor="dispatcher-alias">
                  Dispatching alias
                </label>
                <input
                  id="dispatcher-alias"
                  type="text"
                  className="form-input"
                  placeholder="Name used with carriers, e.g. John"
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                />
                <span className="form-label-optional">
                  Shown as the primary display name; the real name still appears
                  on salary slips.
                </span>
              </div>
            )}
          </div>

          {isDispatcher && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="dispatcher-percentage">
                  Commission %
                </label>
                <input
                  id="dispatcher-percentage"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.1"
                  className="form-input"
                  placeholder="10"
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-designation">
                Designation
              </label>
              <input
                id="dispatcher-designation"
                type="text"
                className="form-input"
                placeholder="Dispatcher"
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-cnic">
                CNIC <span className="form-label-optional">(optional)</span>
              </label>
              <input
                id="dispatcher-cnic"
                type="text"
                className="form-input"
                placeholder="35202-1234567-1"
                value={cnic}
                onChange={(event) => setCnic(event.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="dispatcher-account-number">
              Account number{" "}
              <span className="form-label-optional">(optional)</span>
            </label>
            <input
              id="dispatcher-account-number"
              type="text"
              className="form-input"
              placeholder="03011234567 (Easypaisa)"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />
          </div>

          {isDispatcher && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="dispatcher-sheet-id">
                  Google Sheet link{" "}
                  <span className="form-label-optional">(optional)</span>
                </label>
                <input
                  id="dispatcher-sheet-id"
                  type="text"
                  className="form-input"
                  placeholder="Sheets URL or file ID"
                  value={googleSheetId}
                  onChange={(event) => setGoogleSheetId(event.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dispatcher-sheet-tab">
                  Sheet tab name{" "}
                  <span className="form-label-optional">(optional)</span>
                </label>
                <input
                  id="dispatcher-sheet-tab"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Redline Freight"
                  value={googleSheetTab}
                  onChange={(event) => setGoogleSheetTab(event.target.value)}
                />
              </div>
            </div>
          )}
          {isDispatcher &&
            (!googleSheetId.trim() || !googleSheetTab.trim()) && (
              <p className="form-label-optional">
                Not required now, but gross data won't sync until both the sheet
                link and tab name are filled in — the profile will show this as
                unlinked until then.
              </p>
            )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-email">
                Email <span className="form-label-optional">(optional)</span>
              </label>
              <input
                id="dispatcher-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-phone">
                Phone <span className="form-label-optional">(optional)</span>
              </label>
              <input
                id="dispatcher-phone"
                type="tel"
                className="form-input"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-address">
                Address <span className="form-label-optional">(optional)</span>
              </label>
              <input
                id="dispatcher-address"
                type="text"
                className="form-input"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-gender">
                Gender <span className="form-label-optional">(optional)</span>
              </label>
              <select
                id="dispatcher-gender"
                className="form-select"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-dob">
                Date of birth{" "}
                <span className="form-label-optional">(optional)</span>
              </label>
              <input
                id="dispatcher-dob"
                type="date"
                className="form-input"
                value={dob ?? ""}
                onChange={(event) => setDob(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-joined">
                Joined date
              </label>
              <input
                id="dispatcher-joined"
                type="date"
                className="form-input"
                value={joinedDate}
                onChange={(event) => setJoinedDate(event.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-status">
                Status
              </label>
              <select
                id="dispatcher-status"
                className="form-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="active">Active</option>
                <option value="left">Left</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-left">
                Left date{" "}
                {status !== "left" && (
                  <span className="form-label-optional">(n/a)</span>
                )}
              </label>
              <input
                id="dispatcher-left"
                type="date"
                className="form-input"
                disabled={status !== "left"}
                value={leftDate ?? ""}
                onChange={(event) => setLeftDate(event.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="dispatcher-basic-monthly">
                Base salary — monthly
              </label>
              <input
                id="dispatcher-basic-monthly"
                type="number"
                inputMode="decimal"
                min="0"
                className="form-input"
                placeholder="0"
                value={basicMonthly}
                onChange={(event) => setBasicMonthly(event.target.value)}
              />
              <span className="form-label-optional">
                ≈ {derivedBasicSalary.Weekly.toLocaleString("en-US")} / week ·{" "}
                {derivedBasicSalary.Yearly.toLocaleString("en-US")} / year
              </span>
            </div>
            {isDispatcher && (
              <div className="form-group">
                <label className="form-label" htmlFor="dispatcher-fuel-monthly">
                  Fuel allowance — monthly
                </label>
                <input
                  id="dispatcher-fuel-monthly"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  className="form-input"
                  placeholder="0"
                  value={fuelMonthly}
                  onChange={(event) => setFuelMonthly(event.target.value)}
                />
                <span className="form-label-optional">
                  ≈ {derivedFuelAllowance.Weekly.toLocaleString("en-US")} / week
                  · {derivedFuelAllowance.Yearly.toLocaleString("en-US")} / year
                </span>
              </div>
            )}
          </div>

          <p className="form-label-optional">
            {isDispatcher
              ? "Gross comes from the dispatcher's Google Sheets sync."
              : "This employee receives a fixed monthly base salary; gross and Sheets sync do not apply."}
          </p>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            {isEdit ? (
              confirmingDelete ? (
                <div className="form-delete-confirm">
                  <span>Delete this employee?</span>
                  <button
                    type="button"
                    className="text-link text-link-danger"
                    onClick={() => onDelete(dispatcher.id)}
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="icon-text-btn icon-text-btn-danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )
            ) : (
              <span />
            )}

            <div className="form-actions-right">
              <button type="button" className="toolbar-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
