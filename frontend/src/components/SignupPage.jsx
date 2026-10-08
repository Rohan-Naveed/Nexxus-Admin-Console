import { useState } from "react";
import { Truck } from "lucide-react";

export default function SignupPage({ authService, onSignedUp, onGoToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await authService.signup(email.trim(), password, role);
      onSignedUp(user);
    } catch (err) {
      // Surfaces the backend's "admin already exists" / "email already
      // registered" messages (409) as-is, same as any other error.
      setError(err.message || "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <Truck size={24} color="var(--route)" strokeWidth={2.2} />
          <span className="sidebar-logo-text">NEXXUS</span>
        </div>
        <h1 className="auth-title">Create an account</h1>
        <p className="auth-subtitle">Sign up to access the Nexxus admin console.</p>

        <form className="expense-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-confirm-password">
              Confirm password
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Account type</label>
            <div className="auth-role-row">
              <label className="auth-role-option">
                <input
                  type="radio"
                  name="role"
                  value="user"
                  checked={role === "user"}
                  onChange={() => setRole("user")}
                />
                <span>User</span>
              </label>
              <label className="auth-role-option">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                <span>Admin</span>
              </label>
            </div>
            <p className="form-label-optional">
              Only one admin account is allowed. If one is already registered,
              signing up as admin will be rejected.
            </p>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="primary-btn auth-submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <button type="button" className="auth-link" onClick={onGoToLogin}>
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
