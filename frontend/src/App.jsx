import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createAuthService } from "./services/authService";
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import ComingSoonPage from "./components/ComingSoonPage";
import ThemeToggle from "./components/ThemeToggle";
import AdminConsole from "./AdminConsole";

// Top-level auth gate. No router in this app (AdminConsole itself is
// state-driven, not route-driven), so this is just a small state
// machine: figure out if there's a session, then render one of
// Login / Signup / ComingSoon / AdminConsole based on session + role.
//
// "checking" -> "login" | "signup" | "console" | "coming-soon"
export default function App() {
  const authService = useRef(createAuthService()).current;
  const [status, setStatus] = useState("checking");
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("nexxus-theme") === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("nexxus-theme", theme);
    } catch {
      // Keep the current-session theme when browser storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    authService.me().then((existingUser) => {
      if (cancelled) return;
      if (existingUser) {
        setUser(existingUser);
        setStatus(existingUser.role === "admin" ? "console" : "coming-soon");
      } else {
        setStatus("login");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authService]);

  function handleAuthed(nextUser) {
    setUser(nextUser);
    setStatus(nextUser.role === "admin" ? "console" : "coming-soon");
  }

  async function handleLogout() {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setStatus("login");
    }
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  if (status === "checking") {
    return (
      <>
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="auth-theme-toggle"
        />
        <div className="auth-shell">
          <span
            className="spin"
            style={{
              width: 24,
              height: 24,
              border: "2px solid var(--line)",
              borderTopColor: "var(--route)",
              borderRadius: "999px",
              display: "inline-block",
            }}
          />
        </div>
      </>
    );
  }

  if (status === "login") {
    return (
      <>
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="auth-theme-toggle"
        />
        <LoginPage
          authService={authService}
          onLoggedIn={handleAuthed}
          onGoToSignup={() => setStatus("signup")}
        />
      </>
    );
  }

  if (status === "signup") {
    return (
      <>
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="auth-theme-toggle"
        />
        <SignupPage
          authService={authService}
          onSignedUp={handleAuthed}
          onGoToLogin={() => setStatus("login")}
        />
      </>
    );
  }

  if (status === "coming-soon") {
    return (
      <>
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="auth-theme-toggle"
        />
        <ComingSoonPage user={user} onLogout={handleLogout} />
      </>
    );
  }

  return (
    <AdminConsole
      user={user}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}
