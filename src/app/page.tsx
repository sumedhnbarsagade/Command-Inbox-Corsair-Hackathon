"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/trpc/react";

import { AppRail, type AppTab } from "@/app/_components/app-rail";
import { AgentChat } from "@/app/_components/agent-chat";
import { CalendarPanel } from "@/app/_components/calendar-panel";
import {
  CommandPalette,
  type CommandItem,
} from "@/app/_components/command-palette";
import { GmailPanel } from "@/app/_components/gmail-panel";

type Tab = AppTab;
type ThemeMode = "light" | "dark";

const SHORTCUTS = [
  { action: "Command menu", keys: ["⌘", "K"] },
  { action: "Compose email", keys: ["c"] },
  { action: "Navigate emails", keys: ["j", "k"] },
  { action: "Reply", keys: ["r"] },
  { action: "Search", keys: ["/"] },
  { action: "New event", keys: ["n"] },
  { action: "Prev / next week", keys: ["←", "→"] },
  { action: "Go to today", keys: ["t"] },
  { action: "Close / back", keys: ["Esc"] },
  { action: "Keyboard shortcuts", keys: ["?"] },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("gmail");
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Authentication & Integration State
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Google OAuth Config State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);

  // Success / Error alerts from OAuth redirect
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(null);

  // Queries & Mutations
  const { data: meData, isLoading: isMeLoading } = api.auth.getMe.useQuery();
  const oauthStatus = api.auth.getGoogleOAuthStatus.useQuery(undefined, {
    enabled: !!meData?.user,
  });
  const utils = api.useUtils();

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme");
    const nextTheme = storedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    // Sync session cookie → localStorage (needed after Google OAuth redirect)
    const match = /(?:^|; )userId=([^;]*)/.exec(document.cookie);
    const cookieUserId = match ? decodeURIComponent(match[1] ?? "") : null;
    if (cookieUserId && window.localStorage.getItem("userId") !== cookieUserId) {
      window.localStorage.setItem("userId", cookieUserId);
      void utils.auth.getMe.invalidate();
    }
  }, [utils.auth.getMe]);

  const toggleTheme = () => {
    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      return nextTheme;
    });
  };

  const signup = api.auth.signup.useMutation({
    onSuccess: (data) => {
      window.localStorage.setItem("userId", data.userId);
      document.cookie = `userId=${data.userId}; path=/; max-age=${60 * 60 * 24 * 7}`;
      window.location.reload();
    },
    onError: (err) => {
      setAuthError(err.message);
    },
  });

  const login = api.auth.login.useMutation({
    onSuccess: (data) => {
      window.localStorage.setItem("userId", data.userId);
      document.cookie = `userId=${data.userId}; path=/; max-age=${60 * 60 * 24 * 7}`;
      window.location.reload();
    },
    onError: (err) => {
      setAuthError(err.message);
    },
  });

  const configureOAuth = api.auth.configureGoogleOAuth.useMutation({
    onSuccess: async () => {
      await oauthStatus.refetch();
      setShowConfigModal(false);
      setClientId("");
      setClientSecret("");
      setConfigError(null);
    },
    onError: (err) => {
      setConfigError(err.message);
    },
  });

  const getOAuthUrl = api.auth.getGoogleOAuthUrl.useMutation();

  // Extract query params for OAuth redirects
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("oauth_error");
      const success = params.get("connection_success");
      const loginSuccess = params.get("login_success");

      if (err) {
        setOauthError(decodeURIComponent(err));
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (success) {
        setConnectionSuccess(decodeURIComponent(success));
        window.history.replaceState({}, document.title, window.location.pathname);
        void utils.auth.getGoogleOAuthStatus.invalidate();
      }
      if (loginSuccess) {
        const match = /(?:^|; )userId=([^;]*)/.exec(document.cookie);
        const cookieUserId = match ? decodeURIComponent(match[1] ?? "") : null;
        if (cookieUserId) {
          window.localStorage.setItem("userId", cookieUserId);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      }
    }
  }, [utils.auth.getGoogleOAuthStatus]);

  const handleLogout = () => {
    window.localStorage.removeItem("userId");
    document.cookie = "userId=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    window.location.reload();
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (authMode === "login") {
      login.mutate({ email: authEmail, password: authPassword });
    } else {
      signup.mutate({ email: authEmail, password: authPassword, name: authName });
    }
  };

  const getGoogleOAuthLoginUrl = api.auth.getGoogleOAuthLoginUrl.useMutation();

  const handleGoogleSignIn = () => {
    setAuthError(null);
    getGoogleOAuthLoginUrl.mutate(
      {
        redirectUri: window.location.origin + "/api/auth/callback",
      },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          } else {
            setAuthError(data.error ?? "Failed to start Google sign-in");
          }
        },
        onError: (err) => {
          setAuthError(err.message);
        },
      },
    );
  };

  const handleConnectIntegration = (pluginId: "gmail" | "googlecalendar") => {
    getOAuthUrl.mutate(
      {
        pluginId,
        redirectUri: window.location.origin + "/api/auth/callback",
      },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          } else {
            setOauthError("Failed to start Google authorization. Please try again.");
          }
        },
        onError: (err) => {
          setOauthError(err.message);
        },
      },
    );
  };

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "compose",
        label: "Compose Email",
        description: "Open the compose window",
        shortcut: "c",
        icon: "✉️",
        section: "Email",
        action: () => setTab("gmail"),
      },
      {
        id: "inbox",
        label: "View Inbox",
        description: "Go to your inbox",
        shortcut: "i",
        icon: "📥",
        section: "Email",
        action: () => setTab("gmail"),
      },
      {
        id: "drafts",
        label: "View Drafts",
        description: "See saved drafts",
        shortcut: "d",
        icon: "📝",
        section: "Email",
        action: () => setTab("gmail"),
      },
      {
        id: "calendar",
        label: "View Calendar",
        description: "Switch to calendar view",
        icon: "📅",
        section: "Calendar",
        action: () => setTab("calendar"),
      },
      {
        id: "new-event",
        label: "Create Event",
        description: "Open new event modal",
        shortcut: "n",
        icon: "➕",
        section: "Calendar",
        action: () => setTab("calendar"),
      },
      {
        id: "agent",
        label: "Open Agent Chat",
        description: "Chat with AI to send emails and schedule meetings",
        icon: "🤖",
        section: "Agent",
        action: () => setTab("agent"),
      },
      {
        id: "shortcuts",
        label: "Keyboard Shortcuts",
        description: "View all keyboard shortcuts",
        shortcut: "?",
        icon: "⌨️",
        section: "Help",
        action: () => setShowShortcuts(true),
      },
    ],
    [],
  );

  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setShowCmdPalette((v) => !v);
      return;
    }

    if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHints(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  // 1. Loading state
  if (isMeLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-spinner" />
      </div>
    );
  }

  // 2. Unauthenticated state: Login / Signup
  if (!meData?.user) {
    return (
      <div className="auth-shell">
        <style>{`
          .auth-shell {
            height: 100vh;
            width: 100vw;
            display: flex;
            justify-content: center;
            align-items: center;
            background: radial-gradient(circle at top right, rgba(0, 120, 212, 0.08), transparent 45%),
                        radial-gradient(circle at bottom left, rgba(0, 120, 212, 0.05), transparent 45%),
                        #0b0b0c;
            font-family: var(--font-sans);
          }
          .auth-card {
            background: rgba(24, 24, 27, 0.75);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 40px;
            width: 100%;
            max-width: 420px;
            box-shadow: var(--shadow-lg), var(--shadow-glow);
          }
          .auth-header {
            text-align: center;
            margin-bottom: 30px;
          }
          .auth-logo {
            font-size: 32px;
            margin-bottom: 8px;
          }
          .auth-title {
            font-size: 24px;
            font-weight: 600;
            color: var(--text-primary);
          }
          .auth-subtitle {
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 4px;
          }
          .auth-input-group {
            margin-bottom: 20px;
          }
          .auth-label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .auth-input {
            width: 100%;
            padding: 12px 14px;
            background: var(--bg-base);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-size: 14px;
            transition: var(--transition-fast);
          }
          .auth-input:focus {
            outline: none;
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 2px var(--accent-blue-dim);
          }
          .auth-btn-primary {
            width: 100%;
            padding: 12px;
            background: var(--accent-primary);
            color: #fff;
            border: none;
            border-radius: var(--radius-sm);
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition-base);
            margin-top: 10px;
          }
          .auth-btn-primary:hover {
            opacity: 0.95;
            transform: translateY(-1px);
          }
          .auth-divider {
            display: flex;
            align-items: center;
            text-align: center;
            color: var(--text-muted);
            margin: 24px 0;
            font-size: 12px;
          }
          .auth-divider::before, .auth-divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid var(--border-subtle);
          }
          .auth-divider:not(:empty)::before { margin-right: .5em; }
          .auth-divider:not(:empty)::after { margin-left: .5em; }
          .auth-google-btn {
            width: 100%;
            padding: 12px;
            background: transparent;
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: var(--transition-base);
          }
          .auth-google-btn:hover {
            background: var(--bg-hover);
          }
          .auth-toggle {
            text-align: center;
            margin-top: 24px;
            font-size: 13px;
            color: var(--text-secondary);
          }
          .auth-toggle-link {
            color: var(--accent-blue);
            cursor: pointer;
            font-weight: 500;
          }
          .auth-toggle-link:hover {
            text-decoration: underline;
          }
          .auth-error {
            background: rgba(248, 113, 113, 0.1);
            border: 1px solid var(--accent-red);
            color: var(--accent-red);
            padding: 10px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            margin-bottom: 20px;
          }
          .auth-spinner {
            border: 3px solid rgba(255,255,255,0.1);
            border-radius: 50%;
            border-top: 3px solid var(--accent-blue);
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">⚡</div>
            <h1 className="auth-title">CommandFlow</h1>
            <p className="auth-subtitle">The fastest email and calendar experience</p>
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          <form onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <div className="auth-input-group">
                <label className="auth-label">Name</label>
                <input
                  type="text"
                  required
                  className="auth-input"
                  placeholder="Sumedh Barsagade"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
              </div>
            )}
            <div className="auth-input-group">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                required
                className="auth-input"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </div>
            <div className="auth-input-group">
              <label className="auth-label">Password</label>
              <input
                type="password"
                required
                className="auth-input"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-btn-primary">
              {authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-divider">or</div>

          <button
            type="button"
            className="auth-google-btn"
            onClick={handleGoogleSignIn}
            disabled={getGoogleOAuthLoginUrl.isPending}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </button>

          <div className="auth-toggle">
            {authMode === "login" ? (
              <>
                New to CommandFlow?{" "}
                <span
                  className="auth-toggle-link"
                  onClick={() => setAuthMode("signup")}
                >
                  Create an account
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span
                  className="auth-toggle-link"
                  onClick={() => setAuthMode("login")}
                >
                  Sign in
                </span>
              </>
            )}
          </div>
        </div>

      </div>
    );
  }

  // 3. Authenticated State but Google Client Credentials not configured in database
  const isGoogleConfigured = oauthStatus.data?.isConfigured;

  // Onboarding Panels
  const renderOnboarding = (plugin: "gmail" | "googlecalendar") => {
    const isGmail = plugin === "gmail";
    const isConnected = isGmail
      ? oauthStatus.data?.gmailConnected
      : oauthStatus.data?.calendarConnected;

    if (isConnected) return null;

    return (
      <div className="onboarding-pane">
        <style>{`
          .onboarding-pane {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: calc(100vh - var(--topbar-height) - 40px);
            padding: 40px;
            background: var(--bg-base);
          }
          .onboarding-card {
            background: var(--bg-surface);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-lg);
            padding: 48px;
            max-width: 520px;
            text-align: center;
            box-shadow: var(--shadow-md);
          }
          .onboarding-icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .onboarding-title {
            font-size: 22px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 12px;
          }
          .onboarding-desc {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 30px;
            line-height: 1.6;
          }
          .onboarding-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: var(--accent-primary);
            color: white;
            padding: 14px 28px;
            border-radius: var(--radius-md);
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: var(--transition-base);
          }
          .onboarding-btn:hover {
            opacity: 0.95;
            transform: translateY(-1px);
          }
        `}</style>

        <div className="onboarding-card">
          <div className="onboarding-icon">{isGmail ? "📥" : "📅"}</div>
          <h2 className="onboarding-title">
            Connect {isGmail ? "Gmail" : "Google Calendar"}
          </h2>
          <p className="onboarding-desc">
            To view and manage your {isGmail ? "emails" : "calendar events"} directly inside CommandFlow, link your Google account. Your data will be synced and cached locally.
          </p>
          <button
            type="button"
            className="onboarding-btn"
            onClick={() => handleConnectIntegration(plugin)}
            disabled={getOAuthUrl.isPending}
          >
            {getOAuthUrl.isPending ? "Connecting…" : `Connect ${isGmail ? "Gmail" : "Calendar"}`}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell-v2">
      {oauthError && (
        <div className="banner banner-error" onClick={() => setOauthError(null)}>
          <span>⚠️ {oauthError}</span>
          <button type="button" className="banner-close">✕</button>
        </div>
      )}

      {connectionSuccess && (
        <div className="banner banner-success" onClick={() => setConnectionSuccess(null)}>
          <span>✓ Successfully connected Google {connectionSuccess === "gmail" ? "Gmail" : "Calendar"}!</span>
          <button type="button" className="banner-close">✕</button>
        </div>
      )}

      <AppRail
        activeTab={tab}
        onTabChange={setTab}
        theme={theme}
        onToggleTheme={toggleTheme}
        userInitial={meData?.user?.name ?? meData?.user?.email ?? "U"}
        userEmail={meData?.user?.email}
        onSignOut={handleLogout}
        agentDisabled={!isGoogleConfigured}
      />

      <div className="workspace-main">
        <div className="workspace-content">
          {!isGoogleConfigured ? (
            <div className="onboarding-pane">
              <div className="onboarding-card">
                <div className="onboarding-icon">⚙️</div>
                <h2 className="onboarding-title">Google OAuth Required</h2>
                <p className="onboarding-desc">
                  To link Gmail and Google Calendar, configure your Google Cloud OAuth credentials.
                </p>
                <button type="button" className="onboarding-btn" onClick={() => setShowConfigModal(true)}>
                  Configure credentials
                </button>
              </div>
            </div>
          ) : tab === "agent" ? (
            <AgentChat />
          ) : tab === "gmail" ? (
            oauthStatus.data?.gmailConnected ? (
              <GmailPanel />
            ) : (
              renderOnboarding("gmail")
            )
          ) : oauthStatus.data?.calendarConnected ? (
            <CalendarPanel />
          ) : (
            renderOnboarding("googlecalendar")
          )}
        </div>
      </div>

      <CommandPalette
        isOpen={showCmdPalette}
        onClose={() => setShowCmdPalette(false)}
        commands={commands}
      />

      {showShortcuts && (
        <div className="shortcuts-modal" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-header">
              <span className="shortcuts-title">Keyboard Shortcuts</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowShortcuts(false)}
              >
                ✕
              </button>
            </div>
            <div className="shortcuts-body">
              {SHORTCUTS.map((s) => (
                <div key={s.action} className="shortcut-row">
                  <span className="shortcut-action">{s.action}</span>
                  <span className="shortcut-keys">
                    {s.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showHints && !showCmdPalette && !showShortcuts && (
        <div className="keyboard-hints">
          <div className="keyboard-hint-item">
            <kbd>⌘K</kbd> commands
          </div>
          <div className="keyboard-hint-item">
            <kbd>j</kbd>
            <kbd>k</kbd> navigate
          </div>
          <div className="keyboard-hint-item">
            <kbd>c</kbd> compose
          </div>
          <div className="keyboard-hint-item">
            <kbd>?</kbd> shortcuts
          </div>
        </div>
      )}

      {/* OAuth Setup Modal */}
      {showConfigModal && (
        <div
          className="compose-overlay"
          style={{ display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
          onClick={() => setShowConfigModal(false)}
        >
          <div
            className="compose-panel"
            style={{ width: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="compose-header">
              <span className="compose-title">Configure Google OAuth Credentials</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowConfigModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              setConfigError(null);
              configureOAuth.mutate({ clientId, clientSecret });
            }} style={{ padding: "20px 18px" }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 15 }}>
                Enter your Google Cloud Console Web OAuth Application Credentials. Ensure the redirect URI is configured to:
                <code style={{ display: "block", background: "var(--bg-base)", padding: "4px 8px", borderRadius: 4, margin: "8px 0", fontSize: 12 }}>
                  {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback
                </code>
              </p>
              {configError && (
                <div className="auth-error" style={{ padding: 8, fontSize: 12 }}>
                  {configError}
                </div>
              )}
              <div className="compose-field" style={{ borderBottom: "1px solid var(--border-default)", padding: "8px 0" }}>
                <span className="compose-field-label" style={{ width: 100 }}>Client ID</span>
                <input
                  type="text"
                  required
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", flex: 1 }}
                />
              </div>
              <div className="compose-field" style={{ borderBottom: "1px solid var(--border-default)", padding: "8px 0", marginTop: 10 }}>
                <span className="compose-field-label" style={{ width: 100 }}>Client Secret</span>
                <input
                  type="password"
                  required
                  placeholder="GOCSPX-xxxx"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", flex: 1 }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 25 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfigModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={configureOAuth.isPending}>
                  {configureOAuth.isPending ? "Saving..." : "Save Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
