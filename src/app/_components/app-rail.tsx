"use client";

import { Calendar, Mail, MessageSquare, Moon, Sun } from "lucide-react";

export type AppTab = "gmail" | "calendar" | "agent";

interface AppRailProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  userInitial?: string;
  userEmail?: string;
  onSignOut?: () => void;
  agentDisabled?: boolean;
}

export function AppRail({
  activeTab,
  onTabChange,
  theme,
  onToggleTheme,
  userInitial = "U",
  userEmail,
  onSignOut,
  agentDisabled,
}: AppRailProps) {
  const navItems: { id: AppTab; icon: typeof Mail; label: string; disabled?: boolean }[] = [
    { id: "gmail", icon: Mail, label: "Mail" },
    { id: "calendar", icon: Calendar, label: "Calendar" },
    { id: "agent", icon: MessageSquare, label: "Chat", disabled: agentDisabled },
  ];

  return (
    <aside className="app-rail">
      <div className="app-rail-logo" title="CommandFlow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 12L12 3l9 9-9 9-9-9z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      </div>

      <nav className="app-rail-nav">
        {navItems.map(({ id, icon: Icon, label, disabled }) => (
          <button
            key={id}
            type="button"
            className={`app-rail-btn ${activeTab === id ? "active" : ""}`}
            onClick={() => !disabled && onTabChange(id)}
            disabled={disabled}
            title={label}
            aria-label={label}
            aria-current={activeTab === id ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={1.75} />
          </button>
        ))}
      </nav>

      <div className="app-rail-bottom">
        <button
          type="button"
          className="app-rail-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun size={18} strokeWidth={1.75} />
          ) : (
            <Moon size={18} strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          className="app-rail-avatar"
          title={userEmail ? `${userEmail} — click to sign out` : "Account"}
          onClick={onSignOut}
        >
          {userInitial.charAt(0).toUpperCase()}
        </button>
      </div>
    </aside>
  );
}
