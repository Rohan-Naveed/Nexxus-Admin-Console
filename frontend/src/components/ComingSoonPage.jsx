import { Truck, Clock } from "lucide-react";

// Shown to any logged-in 'user' account. There's no dispatcher/driver
// facing functionality yet — the admin console is admin-only (see
// requireAdmin in the backend) — so this is intentionally a dead end
// until that's built.
export default function ComingSoonPage({ user, onLogout }) {
  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-center">
        <div className="auth-logo">
          <Truck size={24} color="var(--route)" strokeWidth={2.2} />
          <span className="sidebar-logo-text">NEXXUS</span>
        </div>
        <div className="coming-soon-icon">
          <Clock size={32} color="var(--route)" strokeWidth={1.8} />
        </div>
        <h1 className="auth-title">Coming soon</h1>
        <p className="auth-subtitle">
          Signed in as {user?.email}. This part of Nexxus isn&apos;t built yet —
          check back later.
        </p>
        <button type="button" className="toolbar-btn auth-submit" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
