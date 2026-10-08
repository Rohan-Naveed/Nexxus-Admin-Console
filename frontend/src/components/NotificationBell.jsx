import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, CalendarDays, CheckCircle2, DollarSign, Percent, Receipt } from "lucide-react";

// Small notification centre in the top bar. The list is derived by the
// backend from current state (nothing is stored), so an alert simply
// disappears once the problem is fixed. Refreshes on mount, every few
// minutes, and whenever `refreshKey` changes (e.g. after saving weeks).
export default function NotificationBell({ calendarService, refreshKey, onAction }) {
  const [data, setData] = useState({ count: 0, critical: 0, items: [] });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await calendarService.getNotifications());
    } catch {
      // The bell is a convenience — never let it break the page.
    }
  }, [calendarService]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`toolbar-btn notif-btn ${data.critical ? "notif-critical" : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={14} />
        {data.count > 0 && <span className="notif-badge">{data.count}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">Notifications</div>
          {data.items.length === 0 ? (
            <div className="notif-empty">
              <CheckCircle2 size={16} />
              <span>All set. Nothing needs your attention.</span>
            </div>
          ) : (
            data.items.map((item) => (
              <div key={item.id} className={`notif-item notif-${item.severity}`}>
                <div className="notif-icon">
                  {item.type === "weeks_not_set" ? (
                    <CalendarDays size={15} />
                  ) : item.type === "usd_rate_not_set" ? (
                    <DollarSign size={15} />
                  ) : item.type === "tax_rate_not_set" ? (
                    <Percent size={15} />
                  ) : item.type === "monthly_expenses_missing" ? (
                    <Receipt size={15} />
                  ) : (
                    <AlertTriangle size={15} />
                  )}
                </div>
                <div className="notif-body">
                  <div className="notif-title">{item.title}</div>
                  <div className="notif-msg">{item.message}</div>
                  {item.action && (
                    <button
                      className="text-link"
                      onClick={() => {
                        setOpen(false);
                        onAction?.(item.action);
                      }}
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
