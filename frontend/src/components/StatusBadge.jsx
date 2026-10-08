const LABELS = { synced: "Synced", pending: "Sync pending", stale: "Stale" };

export default function StatusBadge({ freshness }) {
  return (
    <span className={`status-badge status-badge-${freshness}`}>
      <span className="status-badge-dot" />
      <span className="status-badge-label">{LABELS[freshness]}</span>
    </span>
  );
}
