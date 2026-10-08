import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { FINE_TYPES } from "../data/fines";
import { getCalendarWeekForDate } from "../utils/periods";

function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function FineFormModal({
  mode, // "add" | "edit"
  entry,
  dispatchers,
  defaultDispatcherId,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [dispatcherId, setDispatcherId] = useState(
    entry?.dispatcherId ?? defaultDispatcherId ?? dispatchers[0]?.id ?? "",
  );
  const [type, setType] = useState(entry?.type ?? "late");
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isEdit = mode === "edit";

  async function handleSubmit(event) {
    event.preventDefault();
    const numericAmount = Number(amount);

    if (!dispatcherId) {
      setError("Pick an employee.");
      return;
    }
    if (!date) {
      setError("Please pick a date.");
      return;
    }
    if (!getCalendarWeekForDate(new Date(`${date}T00:00:00`))) {
      setError("This date is not covered by a week set in the Week Calendar.");
      return;
    }
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setError("Add a short reason for this fine.");
      return;
    }

    try {
      await onSubmit({
        dispatcherId,
        type,
        date,
        amount: numericAmount,
        reason: reason.trim(),
        note: note.trim(),
      });
    } catch (err) {
      setError(err.message || "Could not save this fine.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit fine" : "Add fine"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? "Edit fine" : "Add fine"}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="expense-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="fine-dispatcher">
                Employee
              </label>
              <select
                id="fine-dispatcher"
                className="form-select"
                value={dispatcherId}
                onChange={(event) => setDispatcherId(event.target.value)}
              >
                {dispatchers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fine-type">
                Type
              </label>
              <select
                id="fine-type"
                className="form-select"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                {Object.entries(FINE_TYPES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="fine-date">
                Date
              </label>
              <input
                id="fine-date"
                type="date"
                className="form-input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fine-amount">
                Amount (PKR)
              </label>
              <input
                id="fine-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                className="form-input"
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="fine-reason">
              Reason
            </label>
            <input
              id="fine-reason"
              type="text"
              className="form-input"
              placeholder="What was this fine for?"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="fine-note">
              Note <span className="form-label-optional">(optional)</span>
            </label>
            <textarea
              id="fine-note"
              className="form-textarea"
              placeholder="Any extra context (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            {isEdit ? (
              confirmingDelete ? (
                <div className="form-delete-confirm">
                  <span>Delete this fine?</span>
                  <button
                    type="button"
                    className="text-link text-link-danger"
                    onClick={() => onDelete(entry.id)}
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
              <button type="submit" className="primary-btn">
                {isEdit ? "Save changes" : "Add fine"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
