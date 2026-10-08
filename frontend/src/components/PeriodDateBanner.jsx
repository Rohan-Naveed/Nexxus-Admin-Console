import { Calendar, AlertTriangle } from "lucide-react";
import { getWeekInfo, getMonthWeeksStatus, getYearMonthsStatus } from "../utils/periods";

function NotSetStrip({ onOpenCalendar }) {
  return (
    <div className="period-notset">
      <AlertTriangle size={13} />
      <span>Weeks aren't set for this period, so the standard 1–7, 8–14, 15–21, 22–end split is shown.</span>
      {onOpenCalendar && (
        <button className="text-link" onClick={onOpenCalendar}>
          Set weeks
        </button>
      )}
    </div>
  );
}

export default function PeriodDateBanner({ period, today = new Date(), onOpenCalendar }) {
  if (period === "Weekly") {
    const info = getWeekInfo(today);
    return (
      <div className="period-banner">
        <div className="period-banner-head">
          <Calendar size={14} />
          <span>
            Week {info.weekNumber} of {info.monthLabel} {info.year}
          </span>
          <span className="period-banner-range">{info.rangeLabel}</span>
        </div>
        {info.notSet && <NotSetStrip onOpenCalendar={onOpenCalendar} />}
        <div className="week-day-strip">
          {info.days.map((d) => (
            <div
              key={d.date.toISOString()}
              className={`week-day-chip ${d.isToday ? "today" : ""}`}
            >
              <span className="week-day-chip-label">{d.dayLabel}</span>
              <span className="week-day-chip-num">{d.dayNum}</span>
              {d.isToday && <span className="week-day-chip-marker">Today</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (period === "Monthly") {
    const info = getMonthWeeksStatus(today);
    return (
      <div className="period-banner">
        <div className="period-banner-head">
          <Calendar size={14} />
          <span>
            {info.monthLabel} {info.year}
          </span>
        </div>
        {info.notSet && <NotSetStrip onOpenCalendar={onOpenCalendar} />}
        <div className="period-chip-row">
          {info.weeks.map((w) => (
            <div
              key={w.weekNumber}
              className={`period-chip ${w.current ? "current" : w.reached ? "reached" : "upcoming"}`}
            >
              <span className="period-chip-title">Week {w.weekNumber}</span>
              <span className="period-chip-range">{w.rangeLabel}</span>
              {w.current && <span className="period-chip-tag">Today</span>}
              {!w.reached && <span className="period-chip-tag">Not reached</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Yearly
  const info = getYearMonthsStatus(today);
  return (
    <div className="period-banner">
      <div className="period-banner-head">
        <Calendar size={14} />
        <span>{info.year}</span>
      </div>
      <div className="period-chip-row period-chip-row-months">
        {info.months.map((m) => (
          <div
            key={m.monthIndex}
            className={`period-chip period-chip-compact ${m.current ? "current" : m.reached ? "reached" : "upcoming"}`}
          >
            <span className="period-chip-title">{m.shortLabel}</span>
            {m.current && <span className="period-chip-tag">Today</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
