import { Sparkles } from "lucide-react";

export default function PlaceholderTab({
  title,
  subtitle,
  description,
  bullets,
}) {
  return (
    <div className="panel panel-hero">
      <div className="section-head">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-sub">{subtitle}</div>
        </div>
        <div className="soft-pill">
          <Sparkles size={14} />
          Ready for DB wiring
        </div>
      </div>

      <p className="panel-body">{description}</p>

      <div className="stack-list">
        {bullets.map((bullet) => (
          <div className="list-card list-card-compact" key={bullet}>
            <div className="list-card-title">{bullet}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
