import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  UserRound,
  Pencil,
  Fingerprint,
  Landmark,
  Briefcase,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { fmtMoney, fmtDate } from "../utils/formatters";
import { getPreviousPeriodRange, activeWindowOverlaps } from "../utils/periods";

const LAST_PERIOD_LABEL = {
  Weekly: "Last week",
  Monthly: "Last month",
  Yearly: "Last year",
};

export default function DispatcherDetailModal({
  dispatcher,
  currency,
  usdPerPkr,
  period,
  onClose,
  onEdit,
}) {
  const { profile } = dispatcher;
  const isDispatcher = dispatcher.employeeType === "dispatcher";
  const isActive = profile?.status !== "left";

  const previousRange = getPreviousPeriodRange(period);
  const hadLastPeriod = activeWindowOverlaps(
    profile?.joinedDate,
    profile?.leftDate,
    previousRange.start,
    previousRange.end,
  );
  const lastGrossValue = dispatcher.lastGross?.[period];
  const showLastGross = hadLastPeriod && lastGrossValue != null;
  const sheetLinked =
    isDispatcher &&
    dispatcher.googleSheetId?.trim() &&
    dispatcher.googleSheetTab?.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${dispatcher.name} profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isDispatcher
                ? dispatcher.alias || dispatcher.name
                : dispatcher.name}
            </div>
            {isDispatcher &&
              dispatcher.alias &&
              dispatcher.alias !== dispatcher.name && (
                <div className="panel-sub">Real name: {dispatcher.name}</div>
              )}
            <span className={`pill ${isActive ? "pill-route" : "pill-brick"}`}>
              {isActive ? "Active" : "Left"}
            </span>
            {isDispatcher && !sheetLinked && (
              <span className="pill pill-brick">
                <AlertTriangle size={12} /> Sheet not linked
              </span>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-stats-row">
          <div className="modal-stat">
            <div className="panel-title">Base salary · {period}</div>
            <div className="modal-stat-value">
              {fmtMoney(
                dispatcher.basicSalary?.[period] ?? 0,
                currency,
                usdPerPkr,
              )}
            </div>
          </div>
          {isDispatcher && (
            <div className="modal-stat">
              <div className="panel-title">Commission %</div>
              <div className="modal-stat-value">
                {(dispatcher.percentage * 100).toFixed(1).replace(/\.0$/, "")}%
              </div>
            </div>
          )}
          {isDispatcher && (
            <div className="modal-stat">
              <div className="panel-title">
                Gross · {LAST_PERIOD_LABEL[period]}
              </div>
              <div className="modal-stat-value">
                {showLastGross
                  ? fmtMoney(lastGrossValue, currency, usdPerPkr)
                  : "N/A"}
              </div>
            </div>
          )}
          {isDispatcher && (
            <div className="modal-stat">
              <div className="panel-title">Fuel allowance · {period}</div>
              <div className="modal-stat-value">
                {fmtMoney(
                  dispatcher.fuelAllowance?.[period] ?? 0,
                  currency,
                  usdPerPkr,
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-detail-grid">
          <div className="modal-detail-row">
            <Briefcase size={15} />
            <div>
              <div className="modal-detail-label">Designation</div>
              <div className="modal-detail-value">
                {profile?.designation || "—"}
              </div>
            </div>
          </div>
          {isDispatcher && (
            <div className="modal-detail-row">
              <FileSpreadsheet size={15} />
              <div>
                <div className="modal-detail-label">Google Sheet</div>
                <div className="modal-detail-value">
                  {sheetLinked
                    ? `${dispatcher.googleSheetTab} (${dispatcher.googleSheetId})`
                    : "Not linked yet"}
                </div>
              </div>
            </div>
          )}
          <div className="modal-detail-row">
            <Fingerprint size={15} />
            <div>
              <div className="modal-detail-label">CNIC</div>
              <div className="modal-detail-value">{profile?.cnic || "—"}</div>
            </div>
          </div>
          <div className="modal-detail-row">
            <Landmark size={15} />
            <div>
              <div className="modal-detail-label">Account number</div>
              <div className="modal-detail-value">
                {profile?.accountNumber || "—"}
              </div>
            </div>
          </div>
          <div className="modal-detail-row">
            <Mail size={15} />
            <div>
              <div className="modal-detail-label">Email</div>
              <div className="modal-detail-value">{profile?.email || "—"}</div>
            </div>
          </div>
          <div className="modal-detail-row">
            <Phone size={15} />
            <div>
              <div className="modal-detail-label">Phone</div>
              <div className="modal-detail-value">{profile?.phone || "—"}</div>
            </div>
          </div>
          <div className="modal-detail-row">
            <MapPin size={15} />
            <div>
              <div className="modal-detail-label">Address</div>
              <div className="modal-detail-value">
                {profile?.address || "—"}
              </div>
            </div>
          </div>
          <div className="modal-detail-row">
            <UserRound size={15} />
            <div>
              <div className="modal-detail-label">Gender</div>
              <div className="modal-detail-value">{profile?.gender || "—"}</div>
            </div>
          </div>
          <div className="modal-detail-row">
            <Calendar size={15} />
            <div>
              <div className="modal-detail-label">Date of birth</div>
              <div className="modal-detail-value">{fmtDate(profile?.dob)}</div>
            </div>
          </div>
          <div className="modal-detail-row">
            <Calendar size={15} />
            <div>
              <div className="modal-detail-label">Joined</div>
              <div className="modal-detail-value">
                {fmtDate(profile?.joinedDate)}
              </div>
            </div>
          </div>
          {!isActive && (
            <div className="modal-detail-row">
              <Calendar size={15} />
              <div>
                <div className="modal-detail-label">Left on</div>
                <div className="modal-detail-value">
                  {fmtDate(profile?.leftDate)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span />
          {onEdit && (
            <button
              type="button"
              className="icon-text-btn"
              onClick={() => onEdit(dispatcher)}
            >
              <Pencil size={14} />
              Edit profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
