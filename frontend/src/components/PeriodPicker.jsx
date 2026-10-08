import { CalendarDays } from "lucide-react";

// Compact period control used by Tax and Reports (and anywhere else that
// needs a Monthly/Yearly report period): a small Monthly/Yearly pill
// toggle plus a single dropdown listing every period on file, instead of
// rendering every option as its own row in a separate panel.
export default function PeriodPicker({
  periodType,
  periodKey,
  options,
  onPeriodTypeChange,
  onPeriodKeyChange,
  formatOption,
}) {
  return (
    <div className="period-picker-controls">
      <div className="period-picker-field">
        <span className="period-picker-label" id="period-picker-view-label">
          View
        </span>
        <div
          className="pill-group"
          role="group"
          aria-labelledby="period-picker-view-label"
        >
          {["Monthly", "Yearly"].map((type) => (
            <button
              key={type}
              type="button"
              className={periodType === type ? "active" : ""}
              onClick={() => onPeriodTypeChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <label className="period-picker-field">
        <span className="period-picker-label">
          {periodType === "Yearly" ? "Year" : "Month"}
        </span>
        <span className="period-picker-select-wrap">
          <CalendarDays size={15} aria-hidden="true" />
          <select
            className="form-select period-picker-select"
            value={periodKey ?? ""}
            disabled={options.length === 0}
            onChange={(event) => onPeriodKeyChange(event.target.value)}
            aria-label={
              periodType === "Yearly" ? "Select year" : "Select month"
            }
          >
            {options.length === 0 && (
              <option value="" disabled>
                No periods available
              </option>
            )}
            {options.map((key) => (
              <option key={key} value={key}>
                {formatOption(key)}
              </option>
            ))}
          </select>
        </span>
      </label>
    </div>
  );
}
