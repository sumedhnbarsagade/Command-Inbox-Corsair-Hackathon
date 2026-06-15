"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatMessageDate,
  formatSender,
  LinkifiedText,
  parseEmailAddress,
} from "@/lib/display";
import { api } from "@/trpc/react";

type View = "inbox" | "drafts";
type Priority = "high" | "medium" | "low";

function PriorityBadge({ priority }: { priority: Priority }) {
  const colors = {
    high: { bg: "rgba(248,113,113,0.15)", color: "var(--accent-red)", label: "High" },
    medium: { bg: "rgba(251,191,36,0.12)", color: "var(--accent-yellow)", label: "Med" },
    low: { bg: "rgba(96,96,112,0.15)", color: "var(--text-muted)", label: "Low" },
  };
  const c = colors[priority];
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: "10px",
        background: c.bg,
        color: c.color,
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

export function GmailPanel() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [view, setView] = useState<View>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [showCompose, setShowCompose] = useState(false);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const emails = api.gmail.searchEmails.useQuery(
    { query: activeSearch, limit: 50, offset: 0 },
    { enabled: view === "inbox" },
  );

  const selectedEmail = api.gmail.getMessage.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  const drafts = api.gmail.listDrafts.useQuery(
    { limit: 50, offset: 0 },
    { enabled: view === "drafts" },
  );

  const refreshInbox = api.gmail.refreshInbox.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      await utils.gmail.listDrafts.invalidate();
    },
  });

  const createDraft = api.gmail.createDraft.useMutation({
    onSuccess: async () => {
      await utils.gmail.listDrafts.invalidate();
      setShowCompose(false);
      setTo("");
      setSubject("");
      setBody("");
    },
  });

  const sendEmail = api.gmail.sendEmail.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      setShowCompose(false);
      setTo("");
      setSubject("");
      setBody("");
    },
  });

  const sendDraft = api.gmail.sendDraft.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      await utils.gmail.listDrafts.invalidate();
    },
  });

  const emailList = useMemo(() => emails.data ?? [], [emails.data]);

  const loadPriorities = useCallback(async () => {
    if (!emailList.length) return;
    const toFetch = emailList.slice(0, 15).filter((e) => !priorities[e.id]);
    if (!toFetch.length) return;

    const results = await Promise.all(
      toFetch.map(async (email) => {
        try {
          const result = await utils.client.agent.prioritizeEmail.query({
            subject: email.subject,
            snippet: email.snippet,
            from: email.from,
          });
          return { id: email.id, priority: result.priority };
        } catch {
          return { id: email.id, priority: "medium" as Priority };
        }
      }),
    );

    setPriorities((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.id] = r.priority;
      return next;
    });
  }, [emailList, priorities, utils.client.agent.prioritizeEmail]);

  useEffect(() => {
    if (view === "inbox" && emailList.length > 0) {
      void loadPriorities();
    }
  }, [view, emailList.length, loadPriorities]);

  const openReply = useCallback(() => {
    if (!selectedEmail.data) return;
    const from = selectedEmail.data.from;
    const parsed = parseEmailAddress(from);
    setTo(parsed.email || from);
    setSubject(
      selectedEmail.data.subject?.startsWith("Re:")
        ? selectedEmail.data.subject
        : `Re: ${selectedEmail.data.subject || ""}`,
    );
    setBody("");
    setShowCompose(true);
  }, [selectedEmail.data]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        if (showCompose) {
          setShowCompose(false);
          e.preventDefault();
        } else if (selectedId) {
          setSelectedId(null);
          e.preventDefault();
        }
        return;
      }

      if (typing && e.key !== "Escape") return;

      switch (e.key) {
        case "c":
          e.preventDefault();
          setShowCompose(true);
          break;
        case "i":
        case "v":
          e.preventDefault();
          setView("inbox");
          setSelectedId(null);
          break;
        case "d":
          e.preventDefault();
          setView("drafts");
          setSelectedId(null);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "r":
          if (selectedId) {
            e.preventDefault();
            openReply();
          }
          break;
        case "j":
          if (view === "inbox" && emailList.length) {
            e.preventDefault();
            const next = Math.min(focusedIdx + 1, emailList.length - 1);
            setFocusedIdx(next);
            setSelectedId(emailList[next]!.id);
          }
          break;
        case "k":
          if (view === "inbox" && emailList.length) {
            e.preventDefault();
            const prev = Math.max(focusedIdx - 1, 0);
            setFocusedIdx(prev);
            setSelectedId(emailList[prev]!.id);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showCompose, selectedId, view, emailList, focusedIdx, openReply]);

  const composeModal = showCompose && (
    <div className="compose-overlay" onClick={() => setShowCompose(false)}>
      <div className="compose-panel" onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <span className="compose-title">New Message</span>
          <button type="button" className="btn-icon" onClick={() => setShowCompose(false)}>
            ✕
          </button>
        </div>
        <div className="compose-field">
          <span className="compose-field-label">To</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>
        <div className="compose-field">
          <span className="compose-field-label">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>
        <div className="compose-body">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </div>
        <div className="compose-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sendEmail.mutate({ to, subject, body })}
            disabled={sendEmail.isPending || !to || !subject || !body}
          >
            {sendEmail.isPending ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => createDraft.mutate({ to, subject, body })}
            disabled={createDraft.isPending || !to || !subject || !body}
          >
            Save draft
          </button>
        </div>
      </div>
    </div>
  );

  if (view === "drafts") {
    return (
      <div className="email-pane">
        {composeModal}
        <div className="email-list">
          <div className="email-list-header">
            <h2>Drafts</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setView("inbox")}>
              ← Inbox
            </button>
          </div>
          <div className="email-list-body">
            {drafts.isLoading && <p className="muted" style={{ padding: 16 }}>Loading…</p>}
            {drafts.data?.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>No drafts.</p>
            )}
            {drafts.data?.map((draft) => (
              <div key={draft.id} className="email-row">
                <div className="email-row-top">
                  <span className="email-sender">Draft {draft.id.slice(0, 8)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => sendDraft.mutate({ draftId: draft.id })}
                  disabled={sendDraft.isPending}
                >
                  Send
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="email-empty-state">
          <div className="email-empty-state-icon">📝</div>
          <div className="email-empty-state-title">Drafts</div>
          <div className="email-empty-state-sub">Press <kbd>c</kbd> to compose a new email</div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-pane">
      {composeModal}

      <div className="email-list">
        <div className="email-list-header">
          <h2>Inbox</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => refreshInbox.mutate()}
            disabled={refreshInbox.isPending}
          >
            {refreshInbox.isPending ? "…" : "↻"}
          </button>
        </div>
        <div className="email-list-body">
          {emails.isLoading && (
            <div style={{ padding: 16 }}>
              <div className="skeleton" style={{ height: 48, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 48, marginBottom: 8 }} />
            </div>
          )}
          {emails.error && (
            <p style={{ padding: 16, color: "var(--accent-red)" }}>{emails.error.message}</p>
          )}
          {emailList.length === 0 && !emails.isLoading && (
            <p className="muted" style={{ padding: 16 }}>
              No emails. Press refresh or run Corsair auth.
            </p>
          )}
          {emailList.map((email, idx) => {
            const sender = parseEmailAddress(email.from);
            const isSelected = selectedId === email.id;
            const isFocused = focusedIdx === idx;
            const priority = priorities[email.id] ?? "medium";

            return (
              <div
                key={email.id}
                className={`email-row ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
                onClick={() => {
                  setSelectedId(email.id);
                  setFocusedIdx(idx);
                }}
              >
                <div className="email-row-top">
                  <span className="email-sender">{sender.name || sender.email || "Unknown"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PriorityBadge priority={priority} />
                    {email.date && (
                      <span className="email-date">{formatMessageDate(email.date)}</span>
                    )}
                  </div>
                </div>
                <div className="email-subject">{email.subject || "(no subject)"}</div>
                {email.snippet && <div className="email-snippet">{email.snippet}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="email-detail">
        {selectedId && selectedEmail.isLoading && (
          <div className="email-empty-state">
            <span className="spinner" />
          </div>
        )}
        {selectedId && selectedEmail.error && (
          <div className="email-empty-state">
            <p style={{ color: "var(--accent-red)" }}>{selectedEmail.error.message}</p>
          </div>
        )}
        {selectedEmail.data && (
          <>
            <div className="email-detail-header">
              <div className="email-detail-subject">
                {selectedEmail.data.subject || "(no subject)"}
              </div>
              <div className="email-meta">
                <div className="email-avatar">
                  {(parseEmailAddress(selectedEmail.data.from).name ||
                    parseEmailAddress(selectedEmail.data.from).email ||
                    "?")[0]?.toUpperCase()}
                </div>
                <div className="email-meta-info">
                  <div className="email-from-name">
                    {formatSender(selectedEmail.data.from)}
                  </div>
                  {selectedEmail.data.date && (
                    <div className="email-detail-date">
                      {formatMessageDate(selectedEmail.data.date)}
                    </div>
                  )}
                </div>
              </div>
              <div className="email-detail-actions">
                <button type="button" className="btn btn-secondary" onClick={openReply}>
                  Reply <kbd>r</kbd>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedId(null)}
                >
                  Close <kbd>Esc</kbd>
                </button>
              </div>
            </div>
            <div className="email-detail-body">
              <LinkifiedText
                text={
                  selectedEmail.data.body ||
                  selectedEmail.data.snippet ||
                  "(empty)"
                }
              />
            </div>
          </>
        )}
        {!selectedId && (
          <div className="email-empty-state">
            <div className="email-empty-state-icon">✉️</div>
            <div className="email-empty-state-title">Select an email</div>
            <div className="email-empty-state-sub">
              Use <kbd>j</kbd> / <kbd>k</kbd> to navigate · <kbd>c</kbd> to compose
            </div>
          </div>
        )}
      </div>

      <input
        ref={searchRef}
        type="text"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setActiveSearch(search);
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setSearch("");
            setActiveSearch("");
            e.currentTarget.blur();
          }
        }}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
