export default function KPICard({ label, value, sub, icon: Icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-title-row">
        <span className="kpi-card-label">{label}</span>
        <Icon size={16} className="kpi-card-icon" strokeWidth={2} />
      </div>
      <div className="kpi-card-value">{value}</div>
      {sub && <span className="kpi-card-sub">{sub}</span>}
    </div>
  );
}
