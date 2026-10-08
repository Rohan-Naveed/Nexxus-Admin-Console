import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({ theme, onToggle, className = "" }) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;

  return (
    <button
      type="button"
      className={`toolbar-btn theme-toggle ${className}`.trim()}
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      <span>{nextTheme === "light" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
