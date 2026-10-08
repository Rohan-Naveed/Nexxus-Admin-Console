import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES, MONTHLY_BILL_KEYS } from "../data/expenses";
import { getCalendarWeekForDate, getSetMonthKeys } from "../utils/periods";
import { getMonthKey, getMonthLabel } from "../utils/expenseCalc";

function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function ExpenseFormModal({
  mode, // "add" | "edit"
  entry,
  defaultCategory,
  defaultDate,
  defaultMonth,
  entries = [],
  onClose,
  onSubmit,
  onDelete,
}) {
  const [category, setCategory] = useState(
    entry?.category ?? defaultCategory ?? "dinner",
  );
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? todayIso());

  // Monthly categories (dinner + bills) are entered once per month: the
  // admin picks a month, not a date. Only months that already have weeks
  // set, and that have started, can be picked.
  const currentMonthKey = getMonthKey(new Date());
  const monthOptions = getSetMonthKeys().filter((key) => key <= currentMonthKey);
  const [month, setMonth] = useState(
    entry
      ? getMonthKey(entry.date)
      : defaultMonth ?? (monthOptions.includes(currentMonthKey) ? currentMonthKey : monthOptions[0] ?? ""),
  );
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isMisc = category === "miscellaneous";
  const isMonthly = MONTHLY_BILL_KEYS.includes(category);
  const isEdit = mode === "edit";

  const monthHasEntry = (key) =>
    entries.some((e) => e.category === category && getMonthKey(e.date) === key);

  async function handleSubmit(event) {
    event.preventDefault();
    const numericAmount = Number(amount);

    if (isMonthly) {
      if (!month) {
        setError("Set the month's weeks in the Week Calendar first.");
        return;
      }
      if (!isEdit && monthHasEntry(month)) {
        setError(
          `${EXPENSE_CATEGORIES[category].label} is already entered for ${getMonthLabel(month)}. Edit the existing entry instead.`,
        );
        return;
      }
      if (amount === "" || Number.isNaN(numericAmount) || numericAmount < 0) {
        setError("Enter an amount (0 if this doesn't apply this month).");
        return;
      }
    } else {
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
    }
    if (isMisc && !note.trim()) {
      setError("Add a short note for this miscellaneous expense.");
      return;
    }

    try {
      await onSubmit(
        isMonthly
          ? { category, month, amount: numericAmount, note: note.trim() }
          : { category, date, amount: numericAmount, note: note.trim() },
      );
    } catch (err) {
      setError(err.message || "Could not save this expense.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit expense" : "Add expense"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? "Edit expense" : "Add expense"}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="expense-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="expense-category">
                Category
              </label>
              <select
                id="expense-category"
                className="form-select"
                value={category}
                disabled={isEdit}
                onChange={(event) => setCategory(event.target.value)}
              >
                {Object.entries(EXPENSE_CATEGORIES).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>

            {isMonthly ? (
              <div className="form-group">
                <label className="form-label" htmlFor="expense-month">
                  Month
                </label>
                <select
                  id="expense-month"
                  className="form-select"
                  value={month}
                  disabled={isEdit}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  {(isEdit ? [month] : monthOptions).map((key) => (
                    <option key={key} value={key}>
                      {getMonthLabel(key)}
                      {!isEdit && monthHasEntry(key) ? " (already entered)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="expense-date">
                  Date
                </label>
                <input
                  id="expense-date"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="expense-amount">
              Amount (PKR)
            </label>
            <input
              id="expense-amount"
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

          <div className="form-group">
            <label className="form-label" htmlFor="expense-note">
              Note{" "}
              {isMisc ? (
                ""
              ) : (
                <span className="form-label-optional">(optional)</span>
              )}
            </label>
            <textarea
              id="expense-note"
              className="form-textarea"
              placeholder={
                isMisc ? "What was this for?" : "Add a short note (optional)"
              }
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
                  <span>Delete this entry?</span>
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
                {isEdit ? "Save changes" : "Add expense"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
