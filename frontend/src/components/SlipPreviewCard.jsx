import { useMemo, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  ShieldAlert,
  Info,
  ChevronDown,
  Mail,
} from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import {
  computeSlipPreview,
  parseMonthKey,
  getMonthLabel,
} from "../utils/slipCalc";
import { downloadSlipPdf, generateSlipPdf } from "../utils/pdfSlip";
import { getFinesBreakdownForDispatcherMonth } from "../utils/finesCalc";
import { getMonthGrossUsd } from "../utils/payrollHistoryCalc";

function toNumber(value) {
  const n = Number(value);
  return value === "" || Number.isNaN(n) ? 0 : n;
}

function NumberField({ id, label, value, onChange, prefix }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        className="form-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={prefix ? `${prefix} 0` : "0"}
      />
    </div>
  );
}

function ReadOnlyField({ id, label, value }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <output id={id} className="form-input" style={{ display: "block" }}>
        {value}
      </output>
    </div>
  );
}

export default function SlipPreviewCard({
  dispatcher,
  monthKey,
  usdPerPkr,
  taxPercent,
  blockReason = "",
  existingSlip,
  fineEntries = [],
  onGenerate,
  onSendSlip,
}) {
  const profile = dispatcher.profile ?? {};
  const isDispatcher = dispatcher.employeeType === "dispatcher";
  const slipBlockReason = isDispatcher ? blockReason : "";

  // Historical gross for the SELECTED month — not always "now" — pulled
  // from the weekly sync history (src/data/payrollHistory.js). A brand
  // new dispatcher, or one who'd already left, correctly comes back with
  // hasAnyData: false for months outside their active window.
  // TODO(backend): once salary_slips is a real table, a previously
  // GENERATED slip's own saved figures should still win over this (see
  // `existingSlip?.monthlyGrossUsd ??` below) — this only fills the
  // fields the first time a slip is being put together for that month.
  const grossOnFile = useMemo(
    () => getMonthGrossUsd(dispatcher.id, monthKey),
    [dispatcher.id, monthKey],
  );

  // Late/violation fines default to whatever's on file in the Deductions
  // database for this dispatcher + month (see src/utils/finesCalc.js), so
  // the admin doesn't have to retype them — but a generated slip's saved
  // figures always win, and the fields stay editable either way.
  const finesOnFile = useMemo(
    () =>
      getFinesBreakdownForDispatcherMonth(dispatcher.id, monthKey, fineEntries),
    [dispatcher.id, monthKey, fineEntries],
  );

  const monthlyGrossUsd = Number(
    existingSlip?.monthlyGrossUsd ?? grossOnFile.total,
  );
  const lateFine = finesOnFile.late;
  const violationFine = finesOnFile.violation + finesOnFile.other;
  const [advance, setAdvance] = useState(String(existingSlip?.advance ?? 0));
  const [accountAmount, setAccountAmount] = useState(
    String(existingSlip?.accountAmount ?? 0),
  );
  const [cashAmount, setCashAmount] = useState(
    String(existingSlip?.cashAmount ?? 0),
  );
  const [payoutMode, setPayoutMode] = useState("account");
  const [isExpanded, setIsExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  const noDataAvailable =
    isDispatcher && !existingSlip && !grossOnFile.hasAnyData;

  const preview = useMemo(
    () =>
      computeSlipPreview({
        dispatcher,
        monthKey,
        usdPerPkr: usdPerPkr ?? 0,
        taxPercent,
        monthlyGrossUsd,
        lateFine,
        violationFine,
        advance: toNumber(advance),
        accountAmount: toNumber(accountAmount),
        cashAmount: toNumber(cashAmount),
        payoutMode,
      }),
    [
      dispatcher,
      monthKey,
      usdPerPkr,
      taxPercent,
      monthlyGrossUsd,
      lateFine,
      violationFine,
      advance,
      accountAmount,
      cashAmount,
      payoutMode,
    ],
  );
  const payoutAmountError =
    payoutMode === "cash"
      ? toNumber(cashAmount) < 0
        ? "Cash amount cannot be negative."
        : preview.accountAmount < -0.005
          ? "Cash amount is too high; it would require a negative account payment after tax and other deductions."
          : ""
      : preview.accountAmount < 0
        ? "Account amount cannot be negative."
        : preview.cashAmount < -0.005
          ? "Account amount is too high; it would leave a negative cash payment after tax and other deductions."
          : "";

  async function handleGenerate() {
    setError("");
    if (payoutAmountError) {
      setError(payoutAmountError);
      return;
    }
    setGenerating(true);
    try {
      const { year, monthIndex } = parseMonthKey(monthKey);
      const payload = {
        dispatcherId: dispatcher.id,
        employeeType: dispatcher.employeeType || "dispatcher",
        dispatcherName: dispatcher.name,
        dispatchAlias: dispatcher.alias || dispatcher.name,
        designation:
          profile.designation || (isDispatcher ? "Dispatcher" : "Employee"),
        cnic: profile.cnic || "",
        accountNumber: profile.accountNumber || "",
        email: profile.email || "",
        monthKey,
        periodMonth: monthIndex + 1,
        periodYear: year,
        usdPerPkr: usdPerPkr ?? 0,
        ...preview,
      };
      await onGenerate(payload);
    } catch (err) {
      setError("Couldn't generate the slip. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!existingSlip) return;
    await downloadSlipPdf(existingSlip);
  }

  async function handleSendSlip() {
    if (!existingSlip || !onSendSlip || !profile.email?.trim()) return;
    setEmailError("");
    setSendingEmail(true);
    try {
      const pdf = await generateSlipPdf(existingSlip);
      const dataUri = pdf.output("datauristring");
      const separator = dataUri.indexOf(",");
      if (separator < 0)
        throw new Error("Could not prepare the salary-slip PDF.");
      await onSendSlip(existingSlip.id, dataUri.slice(separator + 1));
    } catch (sendError) {
      setEmailError(
        sendError.message || "Could not send the salary slip email.",
      );
    } finally {
      setSendingEmail(false);
    }
  }

  if (noDataAvailable) {
    return (
      <div className="panel slip-card">
        <div className="section-head">
          <div>
            <div className="panel-title">
              {isDispatcher
                ? dispatcher.alias || dispatcher.name
                : dispatcher.name}
              {isDispatcher &&
              dispatcher.alias &&
              dispatcher.alias !== dispatcher.name
                ? ` (${dispatcher.name})`
                : ""}
            </div>
            <div className="panel-sub">
              {profile.designation ||
                (isDispatcher ? "Dispatcher" : "Employee")}
              {isDispatcher
                ? ` · ${(dispatcher.percentage * 100).toFixed(1).replace(/\.0$/, "")}% commission`
                : " · Fixed monthly salary"}
            </div>
          </div>
          <span className="pill pill-muted">No data this month</span>
        </div>
        <div className="empty-row">
          <Info size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
          No synced gross data for {dispatcher.name} in{" "}
          {getMonthLabel(monthKey)} — likely outside their active dates on the
          roster. Nothing to generate a slip from yet.
        </div>
      </div>
    );
  }

  return (
    <div className="panel slip-card">
      <button
        type="button"
        className="slip-card-disclosure"
        aria-label={`${isExpanded ? "Collapse" : "Expand"} salary slip details for ${dispatcher.name}`}
        aria-expanded={isExpanded}
        aria-controls={`slip-details-${dispatcher.id}`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <div className="slip-card-heading">
          <div className="panel-title">
            {isDispatcher
              ? dispatcher.alias || dispatcher.name
              : dispatcher.name}
            {isDispatcher &&
            dispatcher.alias &&
            dispatcher.alias !== dispatcher.name
              ? ` (${dispatcher.name})`
              : ""}
          </div>
          <div className="panel-sub">
            {profile.designation || (isDispatcher ? "Dispatcher" : "Employee")}
            {isDispatcher
              ? ` · ${(dispatcher.percentage * 100).toFixed(1).replace(/\.0$/, "")}% commission`
              : " · Fixed monthly salary"}
          </div>
        </div>
        <div className="slip-card-head-actions">
          {existingSlip ? (
            <span className="pill pill-route">
              Generated{" "}
              {new Date(existingSlip.generatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          ) : (
            <span className="pill pill-muted">Not generated yet</span>
          )}
          {existingSlip?.emailStatus === "sent" && (
            <span className="pill pill-route">Salary slip sent</span>
          )}
          {existingSlip?.emailStatus === "failed" && (
            <span
              className="pill pill-brick"
              title={existingSlip.emailLastError || "Email delivery failed"}
            >
              Email failed
            </span>
          )}
          {!isExpanded && (
            <div className="slip-card-collapsed-net">
              <span>Net pay</span>
              <strong>
                {fmtMoney(existingSlip?.netPay ?? preview.netPay, "PKR")}
              </strong>
            </div>
          )}
          <span className={`slip-card-chevron ${isExpanded ? "expanded" : ""}`}>
            <ChevronDown size={15} />
          </span>
        </div>
      </button>

      <div
        className={`slip-card-content ${isExpanded ? "expanded" : "collapsed"}`}
        id={`slip-details-${dispatcher.id}`}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className="slip-card-content-inner">
          {isDispatcher && grossOnFile.isPartial && (
            <div className="panel-sub" style={{ marginBottom: 4 }}>
              <Info size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              Only {grossOnFile.syncedWeeks} of {grossOnFile.totalWeeks} weeks
              synced for {getMonthLabel(monthKey)} — gross below reflects just
              those weeks. You can still generate a slip now (useful if this
              dispatcher is leaving or starting mid-month), or wait for the rest
              of the month to sync.
            </div>
          )}

          {finesOnFile.entries.length > 0 && (
            <div className="panel-sub" style={{ marginBottom: 4 }}>
              <ShieldAlert
                size={12}
                style={{ verticalAlign: -2, marginRight: 4 }}
              />
              {finesOnFile.entries.length} deduction
              {finesOnFile.entries.length === 1 ? "" : "s"} from the Deductions
              log for this month. Amounts are read-only here.
            </div>
          )}

          <div className="slip-fields-grid">
            {isDispatcher && (
              <ReadOnlyField
                id={`gross-${dispatcher.id}`}
                label="Monthly Gross (USD)"
                value={`$${monthlyGrossUsd.toFixed(2)}`}
              />
            )}
            <ReadOnlyField
              id={`late-${dispatcher.id}`}
              label="Late fine (PKR)"
              value={fmtMoney(lateFine, "PKR")}
            />
            <ReadOnlyField
              id={`violation-${dispatcher.id}`}
              label="Violation / other fine (PKR)"
              value={fmtMoney(violationFine, "PKR")}
            />
            <NumberField
              id={`advance-${dispatcher.id}`}
              label="Advance (PKR)"
              value={advance}
              onChange={setAdvance}
            />
            <NumberField
              id={`account-${dispatcher.id}`}
              label="Account amount (PKR)"
              value={payoutMode === "account" ? accountAmount : preview.accountAmount}
              onChange={(value) => {
                setAccountAmount(value);
                setPayoutMode("account");
              }}
            />
            <NumberField
              id={`cash-${dispatcher.id}`}
              label="Cash amount (PKR)"
              value={payoutMode === "cash" ? cashAmount : preview.cashAmount}
              onChange={(value) => {
                setCashAmount(value);
                setPayoutMode("cash");
              }}
            />
          </div>
          <div className="panel-sub">
            Edit either payout amount. Income tax is calculated on the account
            amount, and the other payout amount updates automatically.
          </div>
          {payoutAmountError && (
            <div className="form-error">{payoutAmountError}</div>
          )}

          <div className="slip-summary-columns">
            <div className="slip-summary-box">
              <div className="slip-summary-box-title">Earnings</div>
              {isDispatcher && (
                <div className="slip-line">
                  <span>USD Rate</span>
                  <span>pkr{preview.usdRate.toFixed(2)}</span>
                </div>
              )}
              {isDispatcher && (
                <div className="slip-line">
                  <span>Monthly Gross</span>
                  <span>${preview.monthlyGrossUsd.toFixed(2)}</span>
                </div>
              )}
              {isDispatcher && (
                <div className="slip-line">
                  <span>
                    {preview.commissionPercent.toFixed(1).replace(/\.0$/, "")}%
                    Commission
                  </span>
                  <span>${preview.commissionUsd.toFixed(2)}</span>
                </div>
              )}
              {isDispatcher && (
                <div className="slip-line slip-line-accent">
                  <span>Amount in PKR</span>
                  <span>{fmtMoney(preview.amountInPkr, "PKR")}</span>
                </div>
              )}
              <div className="slip-line slip-line-accent">
                <span>Base Salary</span>
                <span>{fmtMoney(preview.basicSalary, "PKR")}</span>
              </div>
              {isDispatcher && (
                <div className="slip-line slip-line-accent">
                  <span>Fuel Allowance</span>
                  <span>{fmtMoney(preview.fuelAllowance, "PKR")}</span>
                </div>
              )}
              <div className="slip-line slip-line-strong">
                <span>Total earnings</span>
                <span>{fmtMoney(preview.totalEarnings, "PKR")}</span>
              </div>
            </div>

            <div className="slip-summary-box">
              <div className="slip-summary-box-title">Deductions</div>
              <div className="slip-line">
                <span>Late / Fine</span>
                <span>{fmtMoney(preview.lateFine, "PKR")}</span>
              </div>
              <div className="slip-line">
                <span>Violation / Fine</span>
                <span>{fmtMoney(preview.violationFine, "PKR")}</span>
              </div>
              <div className="slip-line">
                <span>Advance</span>
                <span>{fmtMoney(preview.advance, "PKR")}</span>
              </div>
              <div className="slip-line">
                <span>Income Tax ({preview.taxPercent}%)</span>
                <span>{fmtMoney(preview.incomeTax, "PKR")}</span>
              </div>
              <div className="slip-line slip-line-danger">
                <span>Total deductions</span>
                <span>{fmtMoney(preview.totalDeductions, "PKR")}</span>
              </div>
              <div className="slip-line" style={{ marginTop: 8 }}>
                <span>Cash</span>
                <span>{fmtMoney(preview.cashAmount, "PKR")}</span>
              </div>
              <div className="slip-line">
                <span>Account</span>
                <span>{fmtMoney(preview.accountAmount, "PKR")}</span>
              </div>
            </div>
          </div>

          <div className="slip-net-banner">
            <span>Net Pay · {preview.periodLabel}</span>
            <strong>{fmtMoney(preview.netPay, "PKR")}</strong>
          </div>

          {error && <div className="form-error">{error}</div>}
          {emailError && <div className="form-error">{emailError}</div>}
          {slipBlockReason && (
            <div className="form-error">{slipBlockReason}</div>
          )}

          <div className="slip-actions">
            {existingSlip && (
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleDownload}
              >
                <Download size={14} />
                Download PDF
              </button>
            )}
            {existingSlip && (
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleSendSlip}
                disabled={sendingEmail || !profile.email?.trim()}
                title={
                  !profile.email?.trim()
                    ? "Add an email address to this employee's profile before sending"
                    : undefined
                }
              >
                {sendingEmail ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Mail size={14} />
                )}
                {sendingEmail
                  ? "Sending…"
                  : existingSlip.emailStatus === "sent"
                    ? "Resend salary slip"
                    : "Send salary slip"}
              </button>
            )}
            <button
              type="button"
              className="primary-btn"
              onClick={handleGenerate}
              disabled={
                generating || Boolean(slipBlockReason) || Boolean(payoutAmountError)
              }
            >
              {generating ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <FileText size={14} />
              )}
              {generating
                ? "Generating…"
                : existingSlip
                  ? "Regenerate slip"
                  : "Generate slip"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
