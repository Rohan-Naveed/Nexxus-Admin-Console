import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { getCalendarMonthKey, getMonthLabel } from "../utils/expenseCalc";

export default function ExpenseFormModal({
  mode,
  entry,
  defaultCategory,
  defaultMonth,
  entries = [],
  categories = [],
  onClose,
  onSubmit,
  onDelete,
}) {
  const currentMonth = getCalendarMonthKey(new Date());
  const [category, setCategory] = useState(
    entry?.category ?? defaultCategory ?? categories.find((item) => item.active)?.key ?? "",
  );
  const [monthKey, setMonthKey] = useState(
    entry?.monthKey ?? defaultMonth ?? currentMonth,
  );
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isEdit = mode === "edit";
  const selectedCategory = categories.find((item) => item.key === category);
  const categoryOptions = categories.filter(
    (item) => item.active || item.key === entry?.category,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const numericAmount = Number(amount);

    if (!selectedCategory?.active && category !== entry?.category) {
      setError("Choose an active expense category.");
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      setError("Choose a valid month.");
      return;
    }
    if (monthKey > currentMonth) {
      setError("Expenses can only be recorded for the current or a past month.");
      return;
    }
    if (amount === "" || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError("Enter an amount of zero or more.");
      return;
    }
    const duplicate = entries.some(
      (item) =>
        item.id !== entry?.id &&
        item.category === category &&
        item.monthKey === monthKey,
    );
    if (duplicate) {
      setError(
        `${selectedCategory?.label ?? "This category"} already has an amount for ${getMonthLabel(monthKey)}.`,
      );
      return;
    }

    try {
      await onSubmit({ category, monthKey, amount: numericAmount, note: note.trim() });
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
        aria-label={isEdit ? "Edit monthly expense" : "Add monthly expense"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            {isEdit ? "Edit monthly expense" : "Add monthly expense"}
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
                onChange={(event) => setCategory(event.target.value)}
                required
              >
                {categoryOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}{item.active ? "" : " (archived)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="expense-month">
                Month
              </label>
              <input
                id="expense-month"
                type="month"
                className="form-input"
                value={monthKey}
                max={currentMonth}
                onChange={(event) => setMonthKey(event.target.value)}
                required
              />
            </div>
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
              step="0.01"
              className="form-input"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="expense-note">
              Note <span className="form-label-optional">(optional)</span>
            </label>
            <textarea
              id="expense-note"
              className="form-textarea"
              placeholder="Add a short note (optional)"
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
                  <span>Delete this monthly expense?</span>
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
